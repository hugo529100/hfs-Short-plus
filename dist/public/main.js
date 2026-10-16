'use strict'; {

    const config = typeof HFS !== 'undefined' && HFS.pluginConfig
        ? HFS.pluginConfig
        : {};

    const ENABLE_TILE_MODE_MEMORY = config.enableTileModeMemory !== false;
    const EXPIRE_HOURS = config.expireHours ?? 24;
    const EXPIRE = EXPIRE_HOURS === 0 ? Infinity : EXPIRE_HOURS * 60 * 60 * 1000;

    const SERVER_TILE_SIZE = config.serverTileSize;

    const TILE_STORAGE_KEY = 'short-folder-tile-mode';
    let tileChanging = false;
    let currentTileUri = '';
    let saveTimeout = null;
    let lastSavedTileSize = undefined;
    let isNavigating = false;

    function loadTileData() {
        try {
            const raw = localStorage.getItem(TILE_STORAGE_KEY);
            if (!raw) return {};
            return JSON.parse(raw);
        } catch {
            return {};
        }
    }

    function saveTileData(data) {
        localStorage.setItem(TILE_STORAGE_KEY, JSON.stringify(data));
    }

    function getTileModeKey(path) {
        const cleanPath = path.split('?')[0];
        return cleanPath.endsWith('/') ? cleanPath : cleanPath + '/';
    }

    function getTileSizeFromState() {
        if (typeof HFS !== 'undefined' && HFS.state && HFS.state.tile_size !== undefined) {
            return HFS.state.tile_size;
        }
        return undefined;
    }

    function setTileSize(value) {
        if (typeof HFS !== 'undefined' && HFS.state) {
            tileChanging = true;
            HFS.state.tile_size = value;
            tileChanging = false;
        }
    }

    function applyTileSizeToDOM(size) {
        try {
            const listWrapper = document.querySelector('.list-wrapper');
            if (listWrapper) {
                listWrapper.style.setProperty('--tile-size', size);
            }
        } catch (e) {}
    }

    function getServerDefaultTileSize() {
        return SERVER_TILE_SIZE;
    }

    function cleanExpiredTileData() {
        if (EXPIRE === Infinity) return;
        const now = Date.now();
        const data = loadTileData();
        let changed = false;
        for (const key in data) {
            if (now - data[key].time > EXPIRE) {
                delete data[key];
                changed = true;
            }
        }
        if (changed) {
            saveTileData(data);
        }
    }

    function scheduleSave() {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
        }
        saveTimeout = setTimeout(() => {
            if (currentTileUri) {
                const currentSize = getTileSizeFromState();
                if (currentSize !== undefined && currentSize !== lastSavedTileSize) {
                    saveTileModeForPath(currentTileUri);
                    lastSavedTileSize = currentSize;
                }
            }
            saveTimeout = null;
        }, 300);
    }

    function immediateSave() {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
            saveTimeout = null;
        }
        if (currentTileUri) {
            const currentSize = getTileSizeFromState();
            if (currentSize !== undefined && currentSize !== lastSavedTileSize) {
                saveTileModeForPath(currentTileUri);
                lastSavedTileSize = currentSize;
            }
        }
    }

    function loadTileModeForPath(path) {
        if (!ENABLE_TILE_MODE_MEMORY) return;
        if (typeof HFS === 'undefined' || !HFS.state) return;

        cleanExpiredTileData();

        const key = getTileModeKey(path);
        const data = loadTileData();
        const saved = data[key];

        const defaultSize = getServerDefaultTileSize() || 2;

        if (saved !== undefined && saved.size !== undefined) {
            if (EXPIRE !== Infinity && Date.now() - saved.time > EXPIRE) {
                delete data[key];
                saveTileData(data);
                setTileSize(defaultSize);
                applyTileSizeToDOM(defaultSize);
                lastSavedTileSize = defaultSize;
                return;
            }

            if (ENABLE_TILE_MODE_MEMORY) {
                data[key].time = Date.now();
                saveTileData(data);
            }

            setTileSize(saved.size);
            applyTileSizeToDOM(saved.size);
            lastSavedTileSize = saved.size;
            return;
        }

        setTileSize(defaultSize);
        applyTileSizeToDOM(defaultSize);
        lastSavedTileSize = defaultSize;
    }

    function saveTileModeForPath(path) {
        if (!ENABLE_TILE_MODE_MEMORY) return;
        if (typeof HFS === 'undefined' || !HFS.state) return;

        const key = getTileModeKey(path);
        const currentSize = getTileSizeFromState();

        if (currentSize === undefined) return;

        const data = loadTileData();
        data[key] = {
            size: currentSize,
            time: Date.now()
        };
        saveTileData(data);
        lastSavedTileSize = currentSize;
    }

    function initTileModeModule() {
        if (!ENABLE_TILE_MODE_MEMORY) return;
        if (typeof HFS === 'undefined' || !HFS.watchState) return;

        setTimeout(function() {
            const currentUri = HFS.state ? HFS.state.uri : location.pathname;
            if (currentUri) {
                const path = currentUri.split('?')[0];
                currentTileUri = getTileModeKey(path);
                loadTileModeForPath(path);

                const currentSize = getTileSizeFromState();
                if (currentSize !== undefined) {
                    lastSavedTileSize = currentSize;
                }
            }
        }, 100);

        HFS.watchState('uri', function(uri) {
            if (!uri) return;

            const path = uri.split('?')[0];
            const newKey = getTileModeKey(path);

            if (currentTileUri === newKey) return;

            isNavigating = true;

            immediateSave();

            currentTileUri = newKey;

            loadTileModeForPath(path);

            const currentSize = getTileSizeFromState();
            if (currentSize !== undefined) {
                lastSavedTileSize = currentSize;
            }

            setTimeout(() => {
                isNavigating = false;
            }, 300);
        });

        HFS.watchState('tile_size', function(value) {
            if (!ENABLE_TILE_MODE_MEMORY) return;
            if (tileChanging) return;
            if (!currentTileUri) return;
            if (isNavigating) return;

            if (value !== undefined) {
                applyTileSizeToDOM(value);
            }

            scheduleSave();
        });

        window.addEventListener('beforeunload', function() {
            immediateSave();
        });
    }

    const style = document.createElement('style')
    style.textContent = `
        .time-faint {
            color: var(--faint-contrast);
        }

        body.sort-reason-active .list-wrapper.tiles-mode .entry-panel {
            flex-wrap: wrap;
        }

        body.sort-reason-active .list-wrapper.tiles-mode .entry-panel .entry-details {
            flex: 1 1 100%;
            min-width: 0;
        }


    `
    document.head.appendChild(style)

    const { state, watchState, onEvent, misc, elementToEntry } = HFS

    let currentSort = state.sort_by || 'name'
    let queued = false
    let retryTimer = 0
    let fileData = null
    let isListMode = false
    let lastMode = null

    function setPluginActive(active) {
        document.body.classList.toggle('sort-reason-active', active)
    }

    function checkMode() {
        const listWrapper = document.querySelector('.list-wrapper')
        if (listWrapper) {
            if (listWrapper.classList.contains('list-mode')) {
                isListMode = true
            } else if (listWrapper.classList.contains('tiles-mode')) {
                isListMode = false
            } else {
                isListMode = !listWrapper.classList.contains('tiles-mode')
            }
        }
        return isListMode
    }

    function checkModeChange() {
        const currentMode = checkMode()
        if (lastMode !== null && currentMode !== lastMode) {
            fileData = null
            reloadFileData()
        }
        lastMode = currentMode
        return currentMode
    }

    function reloadFileData() {
        fileData = null
        if (typeof HFS.reloadList === 'function') {
            HFS.reloadList()
        }
        setTimeout(() => {
            fileData = getFileData()
            updateAll()
        }, 100)
    }

    watchState('sort_by', value => {
        currentSort = value || 'name'
        reloadFileData()
        refresh(true)
    }, true)

    watchState('uri', () => {
        fileData = null
        lastMode = null
        refresh(true)
    })

    onEvent('newListEntries', () => {
        fileData = null
        lastMode = null
        refresh(true)
    })

    const observer = new MutationObserver(mutations => {
        let needRefresh = false
        for (const mutation of mutations) {
            if (mutation.type !== 'childList' && mutation.type !== 'attributes') continue
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue
                if (
                    node.matches?.('.file, .folder, .entry-details, .entry-size, .entry-ts') ||
                    node.querySelector?.('.file, .folder, .entry-details, .entry-size, .entry-ts') ||
                    node.matches?.('.list-wrapper')
                ) {
                    needRefresh = true
                    break
                }
            }
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const target = mutation.target
                if (target && target.matches && target.matches('.list-wrapper')) {
                    needRefresh = true
                    break
                }
            }
        }
        if (needRefresh) {
            fileData = null
            refresh(false)
        }
    })

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
    })

    function refresh(retry) {
        if (queued) return
        queued = true
        requestAnimationFrame(() => {
            queued = false
            checkModeChange()
            updateAll()
            if (retry) {
                clearTimeout(retryTimer)
                retryTimer = setTimeout(() => {
                    updateAll()
                    setTimeout(updateAll, 80)
                    setTimeout(updateAll, 200)
                }, 0)
            }
        })
    }

    function getFileData() {
        try {
            let list = null

            if (HFS.state && HFS.state.list) {
                list = HFS.state.list
            }

            if (!list && typeof HFS.getFileList === 'function') {
                list = HFS.getFileList()
            }

            if (!list && typeof HFS.apiCall === 'function') {
                try {
                    const result = HFS.apiCall('get_file_list', { uri: state.uri || '/' })
                    if (result && result.list) {
                        list = result.list
                    }
                } catch (e) {}
            }

            if (!list) {
                const items = document.querySelectorAll('.file, .folder')
                list = []
                for (const li of items) {
                    try {
                        const entry = elementToEntry(li)
                        if (entry) {
                            list.push(entry)
                        }
                    } catch (e) {}
                }
            }

            if (list && list.length > 0) {
                return list
            }
        } catch (e) {}
        return null
    }

    function findEntry(name, isFolder) {
        if (!fileData) {
            fileData = getFileData()
        }
        if (!fileData) return null

        let searchName = name
        if (isFolder && !searchName.endsWith('/')) {
            searchName = name + '/'
        }
        if (!isFolder && searchName.endsWith('/')) {
            searchName = searchName.slice(0, -1)
        }
        const searchClean = searchName.replace(/\/$/, '')

        for (const entry of fileData) {
            const entryClean = entry.n.replace(/\/$/, '')
            if (entryClean === searchClean) {
                return entry
            }
        }

        try {
            const decoded = decodeURIComponent(searchClean)
            for (const entry of fileData) {
                const entryClean = entry.n.replace(/\/$/, '')
                if (entryClean === decoded) {
                    return entry
                }
            }
        } catch (e) {}

        let bestMatch = null
        let bestScore = 0
        for (const entry of fileData) {
            const entryClean = entry.n.replace(/\/$/, '')
            if (entryClean.includes(searchClean) || searchClean.includes(entryClean)) {
                const score = Math.min(entryClean.length, searchClean.length)
                if (score > bestScore) {
                    bestScore = score
                    bestMatch = entry
                }
            }
        }
        if (bestMatch && bestScore >= 2) {
            return bestMatch
        }

        return null
    }

    const APPEND_Z_FOR_NAIVE_ISO = true;

    function pad2(n) {
        return String(n).padStart(2, '0')
    }

    function formatTime(value) {
        if (!value) return null

        let d = null

        if (value instanceof Date) {
            d = value
        } else if (typeof value === 'number') {
            d = new Date(value)
        } else {
            let str
            try {
                str = String(value)
            } catch (e) {
                return null
            }

            const slashMatch = str.match(/^(\d{2,4})\/(\d{2})\/(\d{2})(.*)$/)
            if (slashMatch) {
                let year = slashMatch[1]
                if (year.length === 2) {
                    year = '20' + year
                }
                str = `${year}-${slashMatch[2]}-${slashMatch[3]}${slashMatch[4]}`
            }

            const naiveIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/
            if (APPEND_Z_FOR_NAIVE_ISO && naiveIso.test(str)) {
                str = str + 'Z'
            }

            d = new Date(str)
        }

        if (!d || isNaN(d.getTime())) {
            try {
                const s = String(value)
                const m = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/)
                if (m) {
                    return `${m[1].slice(-2)}-${m[2]}-${m[3]}`
                }
            } catch (e) {}
            return null
        }

        const year = String(d.getFullYear()).slice(-2)
        const month = pad2(d.getMonth() + 1)
        const day = pad2(d.getDate())
        const hour = pad2(d.getHours())
        const minute = pad2(d.getMinutes())

        if (hour === '00' && minute === '00') {
            return `${year}-${month}-${day}`
        }
        return `${year}-${month}-${day} ${hour}:${minute}`
    }

    function restoreNative(li) {
        const details = li?.querySelector('.entry-details')
        if (!details) return

        const size = details.querySelector('.entry-size')
        const ts = details.querySelector('.entry-ts')

        if (size) {
            size.classList.remove('sort-reason-time-value', 'sort-reason-time')
            size.style.display = ''
            size.style.color = ''
            size.title = ''
            const nameEl = li.querySelector('.entry-name')
            if (nameEl) {
                const entry = findEntry(nameEl.textContent.trim(), li.classList.contains('folder'))
                if (entry && !li.classList.contains('folder')) {
                    size.textContent = entry.s != null ? misc.formatBytes(entry.s) : ''
                } else if (li.classList.contains('folder')) {
                    size.textContent = ''
                }
            }
        }
        if (ts) {
            ts.style.display = ''
            ts.style.color = ''
            ts.classList.remove('sort-reason-time')
        }
    }

    function updateAll() {
        checkModeChange()

        document.querySelectorAll('.sort-reason-time-value').forEach(el => {
            el.classList.remove('sort-reason-time-value')
        })

        if (isListMode) {
            setPluginActive(false)
            document.querySelectorAll('.file, .folder').forEach(restoreNative)
            document.querySelectorAll('.entry-ts[style*="display: none"]').forEach(el => {
                el.style.display = ''
            })
            return
        }

        if (currentSort === 'name' || currentSort === 'size') {
            setPluginActive(false)
            document.querySelectorAll('.sort-reason-time-value, .sort-reason-time').forEach(el => {
                el.classList.remove('sort-reason-time-value', 'sort-reason-time')
                if (el.classList.contains('entry-size')) {
                    el.style.display = ''
                    el.style.color = ''
                    el.title = ''
                    const li = el.closest('.file, .folder')
                    if (li) {
                        const nameEl = li.querySelector('.entry-name')
                        if (nameEl) {
                            const entry = findEntry(nameEl.textContent.trim(), li.classList.contains('folder'))
                            if (entry && !li.classList.contains('folder')) {
                                el.textContent = entry.s != null ? misc.formatBytes(entry.s) : ''
                            } else if (li.classList.contains('folder')) {
                                el.textContent = ''
                            }
                        }
                    }
                }
                if (el.classList.contains('entry-ts')) {
                    el.style.display = ''
                    el.style.color = ''
                }
            })
            document.querySelectorAll('.entry-ts[style*="display: none"]').forEach(el => {
                el.style.display = ''
            })
            return
        }

        setPluginActive(true)
        if (!fileData) {
            fileData = getFileData()
        }
        document.querySelectorAll('.file, .folder').forEach(updateEntry)
    }

    function updateEntry(li) {
        const details = li.querySelector('.entry-details')
        if (!details) return

        const nameEl = li.querySelector('.entry-name')
        if (!nameEl) return

        const domName = nameEl.textContent.trim()
        const isFolder = li.classList.contains('folder')

        const entry = findEntry(domName, isFolder)

        let size = details.querySelector('.entry-size')
        const ts = details.querySelector('.entry-ts')

        if (!size) {
            size = document.createElement('span')
            size.className = 'entry-size'
            if (ts) {
                details.insertBefore(size, ts)
            } else {
                details.appendChild(size)
            }
        }

        if (ts) {
            ts.style.display = 'none'
        }

        if (currentSort === 'extension') {
            let ext = ''
            let sizeStr = ''

            if (entry && entry.ext) {
                ext = entry.ext
            } else if (entry && entry.n) {
                const dot = entry.n.lastIndexOf('.')
                if (dot > 0 && dot < entry.n.length - 1) {
                    ext = entry.n.substring(dot + 1).toLowerCase()
                }
            } else {
                const dot = domName.lastIndexOf('.')
                if (dot > 0 && dot < domName.length - 1) {
                    ext = domName.substring(dot + 1).toLowerCase()
                }
            }

            if (entry && entry.s != null) {
                sizeStr = misc.formatBytes(entry.s)
            }

            if (ext && sizeStr) {
                size.textContent = ext + ' - ' + sizeStr
            } else if (ext) {
                size.textContent = ext
            } else if (sizeStr) {
                size.textContent = sizeStr
            } else {
                size.textContent = ''
            }
            size.style.display = ''
            size.title = 'Sort by: extension'
            size.classList.add('sort-reason-time-value')
            return
        }

        let displayText = null

        if (entry) {
            let timeValue = null
            if (currentSort === 'time') {
                timeValue = entry.m || entry.c || null
            } else if (currentSort === 'creation') {
                timeValue = entry.c || entry.m || null
            }

            if (timeValue) {
                displayText = formatTime(timeValue)
            }
        }

        if (!displayText && ts) {
            const tsText = ts.textContent.trim()
            if (tsText) {
                displayText = tsText
            }
        }

        if (displayText) {
            const parts = displayText.match(/^(.+?)\s+(\d{2}:\d{2})$/)
            if (parts) {
                size.innerHTML = `${parts[1]} <span class="time-faint">${parts[2]}</span>`
            } else {
                size.textContent = displayText
            }
            size.style.display = ''
            size.title = 'Sort by: ' + currentSort
            size.classList.add('sort-reason-time-value')
        } else {
            size.textContent = ''
            size.style.display = ''
            size.title = ''
            size.classList.remove('sort-reason-time-value')
        }
    }

    function init() {
        initTileModeModule();
        lastMode = checkMode()

        if (typeof HFS !== 'undefined') {
            HFS.short = {
                reload: function() {
                    fileData = null;
                    if (typeof HFS.reloadList === 'function') {
                        HFS.reloadList();
                    }
                    setTimeout(() => {
                        fileData = getFileData();
                        updateAll();
                    }, 100);
                },
                tile: {
                    save: function() {
                        if (ENABLE_TILE_MODE_MEMORY && currentTileUri) {
                            immediateSave();
                        }
                    },
                    load: function(path) {
                        if (ENABLE_TILE_MODE_MEMORY) {
                            loadTileModeForPath(path || location.pathname);
                        }
                    },
                    cleanExpired: cleanExpiredTileData,
                    getStorage: function() {
                        return loadTileData();
                    },
                    getServerDefault: function() {
                        return getServerDefaultTileSize();
                    },
                    refresh: function() {
                        if (currentTileUri) {
                            loadTileModeForPath(currentTileUri);
                        }
                    },
                    getCurrentSize: function() {
                        return getTileSizeFromState();
                    }
                }
            };
        }

        setTimeout(() => {
            fileData = getFileData();
            updateAll();
        }, 200);
    }

    let initialized = false;
    function safeInit() {
        if (initialized) return;
        initialized = true;
        init();
    }

    safeInit();
}