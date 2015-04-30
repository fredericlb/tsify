var convert = require('convert-source-map');
var events  = require('events');
var log     = require('debuglog')(require('../package').name);
var path    = require('path');
var through = require('through2');
var time    = require('./time');
var util    = require('util');
var _       = require('lodash');

var CompileError = require('./CompileError');
var Host         = require('./Host');
var ts           = require('./tsc/tsc');

function isTypescript(file) {
	return (/\.ts$/i).test(file);
}

function isTypescriptDeclaration(file) {
	return (/\.d\.ts$/i).test(file);
}

function tsToJs(tsFile) {
	return tsFile.replace(/\.ts$/i, '.js');
}

function getRelativeFileName(file) {
	return './' + path.relative(process.cwd(), file)
		.replace(/\\/g, '/');
}

function Tsifier(opts) {
	opts = opts || {};
	this.opts = {
		module: 'commonjs',
		noImplicitAny: opts.noImplicitAny || false,
		removeComments: opts.removeComments || false,
		sourceMap: true,
		target: ts.ScriptTarget[opts.target || opts.t || 'ES3'],
		skipWrite: true
	};
	this.host = new Host(process.cwd(), this.opts.target);
}

util.inherits(Tsifier, events.EventEmitter);

Tsifier.prototype.reset = function () {
	this.host._reset();
};

Tsifier.prototype.generateCache = function (files) {
	var tsFiles = files.filter(isTypescript)
		.map(getRelativeFileName);
	if (tsFiles.length === 0)
		return;

	this.addAll(tsFiles);
	this.compile();
};

Tsifier.prototype.addAll = function (files) {
	var self = this;
	files.forEach(function (file) {
		self.host._addFile(file, true);
	});
};

Tsifier.prototype.compile = function () {
	var self = this;
	var rootFilenames = _(self.host.files).filter('root').map('fileName').valueOf();

	log('Compiling files:');
	rootFilenames.forEach(function (file) { log('  %s', file); });

	var createProgram_t0 = time.start();
	var program = ts.createProgram(rootFilenames, self.opts, self.host);
	time.stop(createProgram_t0, 'createProgram');

	var diagnostics_t0 = time.start();
	var errors = ts.getPreEmitDiagnostics(program);
	if (!errors.length) {
		errors = program.emit().diagnostics;
	}
	time.stop(diagnostics_t0, 'diagnostic checking');

	errors = errors.filter(function (e) { return e; });
	errors.forEach(function (error) {
		self.emit('error', new CompileError(error));
	});

	if (errors.length)
		self.host.error = true;
};

Tsifier.prototype.transform = function (file) {
	var self = this;

	if (!isTypescript(file))
		return through();

	if (isTypescriptDeclaration(file))
		return through(transform);

	return through(transform, flush);

	function transform(chunk, enc, next) {
		next();
	}
	function flush(next) {
		var compiled = self.getCompiledFile(getRelativeFileName(file));
		if (compiled) {
			this.push(compiled);
		}
		this.push(null);
		next();
	}
};

Tsifier.prototype.getCompiledFile = function (tsFile) {
	var self = this;

	if (self.host.error)
		return;

	var normalized = ts.normalizePath(tsFile);
	var jsFile = tsToJs(normalized);

	var output = self.host.getOutput(jsFile);
	if (!output) {
		log('Cache miss on %s', normalized);
		self.generateCache([tsFile]);
		if (self.host.error)
			return;
		output = self.host.getOutput(jsFile);
		if (!output)
			return;
	}

	var sourcemap = convert.fromJSON(this.host.getOutput(jsFile + '.map'));
	sourcemap.setProperty('sources', [normalized]);
	sourcemap.setProperty('sourcesContent', [self.host.files[normalized].contents]);
	return output.replace(convert.mapFileCommentRegex, sourcemap.toComment());
};

Tsifier.prototype.emitFiles = function () {
	var self = this;
	_.keys(self.host.files).forEach(function (file) {
		self.emit('file', path.resolve(file));
	});
};

module.exports = Tsifier;
module.exports.isTypescript = isTypescript;
module.exports.isTypescriptDeclaration = isTypescriptDeclaration;
