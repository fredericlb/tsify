var fs = require('fs');
var log = require('debuglog')(require('../package').name);
var os = require('os');
var path = require('path');
var ts = require('./tsc/tsc');

var libDefault = ts.createSourceFile(
	'__lib.d.ts',
	fs.readFileSync(path.join(__dirname, './tsc/lib.d.ts'), 'utf-8'),
	ts.ScriptTarget.ES3,
	'0');

var output = {};

function Host(currentDirectory, languageVersion) {
	this.currentDirectory = currentDirectory;
	this.languageVersion = languageVersion;
	this.files = {};
	this.previousFiles = {};
	this.output = {};
	this.version = 0;
	this.error = false;
}

Host.prototype._reset = function () {
	this.previousFiles = this.files;
	this.files = {};
	this.output = {};
	this.error = false;
	++this.version;

	log('Resetting (version %d)', this.version);
};

Host.prototype._addFile = function (fileName, root) {
	var normalized = ts.normalizePath(fileName);

	var text;
	try {
		text = fs.readFileSync(fileName, 'utf-8');
	} catch (ex) {
		return;
	}

	var file;
	if (this.previousFiles[normalized] &&
		this.previousFiles[normalized].contents === text) {
		file = this.previousFiles[normalized].ts;
		log('Reused file %s (version %s)', normalized, file.version);
	} else {
		file = ts.createSourceFile(fileName, text, this.languageVersion, String(this.version));
		log('New version of source file %s (version %s)', normalized, file.version);
	}

	this.files[normalized] = {
		fileName: fileName,
		contents: text,
		ts: file,
		root: root
	};
	return file;
};

Host.prototype.getNewLine = function () {
	return os.EOL;
};

Host.prototype.useCaseSensitiveFileNames = function () {
	var platform = os.platform();
	return platform !== 'win32' && platform !== 'win64' && platform !== 'darwin';
};

Host.prototype.getCurrentDirectory = function () {
	return process.cwd();
};

Host.prototype.getCanonicalFileName = function (fileName) {
	return ts.normalizePath(fileName);
};

Host.prototype.getDefaultLibFileName = function () {
	return '__lib.d.ts';
};

Host.prototype.writeFile = function (fileName, data) {
	output[fileName] = data;
};

Host.prototype.getSourceFile = function (fileName) {
	var normalized = ts.normalizePath(fileName);

	if (this.files[normalized])
		return this.files[normalized].ts;

	if (normalized === '__lib.d.ts')
		return libDefault;

	return this._addFile(fileName, false);
};

Host.prototype.getFileData = function(fileName) {
	var normalized = ts.normalizePath(fileName);
	return this.files[normalized];
};

Host.prototype.getOutput = function(fileName) {
	return output[fileName];
};

module.exports = Host;
