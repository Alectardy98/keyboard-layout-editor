// Folder metadata is separate from layout Gists so original KLE stays compatible.
(function(root, factory) {
    if(typeof module === 'object' && module.exports) module.exports = factory();
    else root.LayoutLibrary = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';
    var FILE = 'keebal-layout-folders.json';
    var FORMAT = 'keebal-layout-folders';
    var MAX_LENGTH = 262144;

    function empty() { return {format:FORMAT, version:1, folders:[], layouts:Object.create(null)}; }
    function folderName(value) {
        if(typeof value !== 'string') throw Error('Enter a folder name.');
        value = value.trim().normalize('NFC');
        if(!value || value.length > 64 || /[\u0000-\u001f\u007f]/.test(value))
            throw Error('Use a folder name of 1–64 characters without control characters.');
        return value;
    }
    function folderExists(document, id) {
        return document.folders.some(function(folder) { return folder.id === id; });
    }
    function parse(content) {
        if(typeof content !== 'string' || content.length > MAX_LENGTH)
            throw Error('The folder file is too large or incomplete; it will not be overwritten.');
        var source;
        try { source = JSON.parse(content); }
        catch(error) { throw Error('The folder file is invalid JSON; it will not be overwritten.'); }
        if(!source || source.format !== FORMAT || source.version !== 1)
            throw Error('This folder-file version is unsupported; it will not be overwritten.');
        if(!Array.isArray(source.folders) || source.folders.length > 100 ||
            !source.layouts || typeof source.layouts !== 'object' || Array.isArray(source.layouts) ||
            Object.keys(source.layouts).length > 10000)
            throw Error('The folder file is invalid; it will not be overwritten.');
        var result = empty(), ids = Object.create(null), names = Object.create(null);
        source.folders.forEach(function(folder) {
            if(!folder || typeof folder.id !== 'string' || !/^folder-[A-Za-z0-9_-]{1,57}$/.test(folder.id) || ids[folder.id])
                throw Error('The folder file contains invalid or duplicate folder IDs.');
            var name = folderName(folder.name), key = name.toLowerCase();
            if(names[key]) throw Error('The folder file contains duplicate folder names.');
            ids[folder.id] = names[key] = true;
            result.folders.push({id:folder.id, name:name});
        });
        Object.keys(source.layouts).forEach(function(id) {
            var folder = source.layouts[id];
            if(!/^[A-Za-z0-9_-]{1,100}$/.test(id) || typeof folder !== 'string' || !ids[folder])
                throw Error('The folder file contains an invalid layout assignment.');
            result.layouts[id] = folder;
        });
        return result;
    }
    function serialize(document) {
        var content = JSON.stringify(document, null, 2);
        parse(content);
        return content;
    }
    function apply(document, operation) {
        var result = parse(serialize(document));
        if(operation.type === 'move') {
            if(typeof operation.layout !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(operation.layout))
                throw Error('Choose a valid layout.');
            if(operation.folder) {
                if(!folderExists(result, operation.folder)) throw Error('That folder no longer exists. Reopen My Layouts.');
                result.layouts[operation.layout] = operation.folder;
            } else delete result.layouts[operation.layout];
        } else if(operation.type === 'create' || operation.type === 'rename') {
            var name = folderName(operation.name);
            if(result.folders.some(function(folder) {
                return folder.id !== operation.id && folder.name.toLowerCase() === name.toLowerCase();
            })) throw Error('A folder with that name already exists.');
            if(operation.type === 'create') {
                if(folderExists(result, operation.id)) throw Error('That folder ID already exists.');
                result.folders.push({id:operation.id, name:name});
            } else {
                if(!folderExists(result, operation.id)) throw Error('That folder no longer exists. Reopen My Layouts.');
                result.folders.forEach(function(folder) { if(folder.id === operation.id) folder.name = name; });
            }
        } else if(operation.type === 'remove') {
            if(!folderExists(result, operation.id)) throw Error('That folder no longer exists. Reopen My Layouts.');
            result.folders = result.folders.filter(function(folder) { return folder.id !== operation.id; });
            Object.keys(result.layouts).forEach(function(id) {
                if(result.layouts[id] === operation.id) delete result.layouts[id];
            });
        } else throw Error('Unknown folder action.');
        serialize(result);
        return result;
    }
    function view(layouts, document, folder, search, page, size) {
        var query = (search || '').trim().toLowerCase();
        var filtered = layouts.filter(function(layout) {
            var assigned = document.layouts[layout.id] || '';
            return (folder === 'all' || (folder === 'unfiled' ? !assigned : assigned === folder)) &&
                (!query || (layout.description || 'Untitled layout').toLowerCase().indexOf(query) >= 0);
        });
        var pages = Math.max(1, Math.ceil(filtered.length / size));
        page = Math.max(1, Math.min(pages, Math.floor(page) || 1));
        return {items:filtered.slice((page - 1) * size, page * size), page:page, pages:pages,
            total:filtered.length, first:filtered.length ? (page - 1) * size + 1 : 0,
            last:Math.min(page * size, filtered.length)};
    }
    // Gist HEAD reads can lag a successful PATCH. Prefer a confirmed revision
    // until HEAD includes it, or a later commit becomes visible.
    function newestRevision(history, hint) {
        var head=history && history[0];
        if(!hint || !hint.version) return head;
        if(!head) return hint;
        if(history.some(function(commit){return commit.version===hint.version;})) return head;
        return Date.parse(head.committed_at)>Date.parse(hint.committed_at) ? head : hint;
    }
    return {file:FILE, empty:empty, parse:parse, serialize:serialize, apply:apply, view:view, folderName:folderName,newestRevision:newestRevision};
}));
