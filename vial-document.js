/* Vial document adapter. Layout editing stays in KLE; firmware metadata stays intact. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VialDocument = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function matrix(document) {
    if (!object(document.matrix) || !Number.isInteger(document.matrix.rows) || !Number.isInteger(document.matrix.cols) ||
        document.matrix.rows < 1 || document.matrix.cols < 1 || document.matrix.rows > 256 || document.matrix.cols > 256)
      throw new Error('Vial matrix.rows and matrix.cols must be positive integers up to 256.');
  }
  function open(value) {
    if (Array.isArray(value)) return { rows: clone(value), document: null };
    if (!object(value) || !object(value.layouts) || !Array.isArray(value.layouts.keymap))
      throw new Error('Open a KLE layout array or a Vial JSON document containing layouts.keymap.');
    matrix(value);
    var document = clone(value), rows = document.layouts.keymap;
    delete document.layouts.keymap;
    return { rows: rows, document: document };
  }
  function validate(document, rows, serial) {
    matrix(document);
    var keys = serial.deserialize(rows).keys;
    keys.forEach(function(key, index) {
      if (key.decal) return;
      var coord = /^\s*(\d+)\s*,\s*(\d+)\s*$/.exec(key.labels[0] || '');
      if (!coord) throw new Error('Key '+(index+1)+' needs a row,column coordinate in its top-left legend.');
      if (key.labels[4] === 'e') {
        if (+coord[2] > 1) throw new Error('Encoder directions must be 0 or 1.');
      } else if (+coord[1] >= document.matrix.rows || +coord[2] >= document.matrix.cols) {
        throw new Error('Key '+(index+1)+' is outside the '+document.matrix.rows+' × '+document.matrix.cols+' Vial matrix.');
      }
      if (key.labels[8]) {
        var tag = /^\s*(\d+)\s*,\s*(\d+)\s*$/.exec(key.labels[8]);
        var labels = document.layouts.labels;
        if (!tag || !Array.isArray(labels) || +tag[1] >= labels.length)
          throw new Error('Key '+(index+1)+' has an undeclared layout-option tag in its bottom-right legend.');
        var choices = labels[+tag[1]], count = Array.isArray(choices) ? choices.length-1 : 2;
        if (+tag[2] >= count) throw new Error('Key '+(index+1)+' refers to an unknown physical layout option.');
      }
    });
  }
  function exportDocument(document, rows, serial) {
    validate(document, rows, serial);
    var result = clone(document);
    result.layouts.keymap = clone(rows);
    return result;
  }
  return { open: open, exportDocument: exportDocument, validate: validate };
}));
