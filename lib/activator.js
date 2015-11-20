/*jslint node:true, nomen:true */
/*jshint unused:vars */

// with defaults
var async = require('async'), crypto = require('crypto'), smtp = require('./mailer'), _ = require('lodash'), mailer, attachments,
rparam = require('./params'),
sha1 = function (msg) {
	return crypto.createHash('sha1').update(msg).digest('hex');
},
DEFAULTS = {
	model: {find: function(user,cb){cb("uninitialized");}, save: function(id,data,cb){cb("uninitialized");}},
	transport: "smtp://localhost:465/activator.net/",
	templates: __dirname+'/templates',
	resetExpire: 60,
	proto: "https://",
	emailProperty: "email",
	from: "help@activator.net",
	styliner: false,
  attachments: {},
	idProperty: null
},
model = DEFAULTS.model, 
transport, 
from,
templates,
emailProperty,
idProperty,
resetExpire, proto,
createActivate = function (req,done) {
	// add the activation code, just a randomization of this very moment, plus the email, hashed together
	var email, id = (req.activator?req.activator.id:null) || (req.user?req.user.id:null), code;
	if (!id) {
		done(500,"uninitialized");
	} else {
		async.waterfall([
			function(cb) {
				model.find(id,cb);
			},
			function(res,cb){
				if (!res) {
					cb(404);
				} else {
					email = res[emailProperty];
					code = sha1(email + new Date().toString().split("").sort(function(){return Math.round(Math.random())-0.5;})).substr(0,8);
					model.save(idProperty?res[idProperty]:id,{activation_code:code},cb);
				}
			},
			function(res,cb) {
				if (!cb && typeof(res) === "function") {
					cb = res;
				}
				mailer("activate",req.lang||"en_US",{code:code,email:email,id:id,request:req},from,email,attachments['activate'],cb);
			}
		],function (err) {
			var code = 400;
			if (err) {
				if (err === 404) {
					code = 404;
				} else if (err === "uninitialized") {
					code = 500;
				}
				done(code,err);
			} else {
				done(201,req.activator?req.activator.body:undefined);
			}
		});
	}
},
completeActivate = function (req,done) {
	var code = req.param("code"), id = req.param("user");

	async.waterfall([
		function (cb) {model.find(id,cb);},
		function (res,cb) {
			if (!res) {
				cb(404);
			} else if (res.activation_code !== code){
				cb("invalidcode");
			} else {
				model.save(idProperty?res[idProperty]:id,{activation_code:"X"},cb);
			}
		}
	],function (err) {
		var code = 400;
		if (err) {
			if (err === 404) {
				code = 404;
			} else if (err === "uninitialized") {
				code = 500;
			}
			done(code,err);
		} else {
			done(200);
		}
	});	
},
createPasswordReset = function (req,done) {
	var reset_code, reset_time, email, id;
	/*
	 * process:
	 * 1) get the user by email
	 * 2) create a random reset code
	 * 3) save it
	 * 4) send an email
	 */
	async.waterfall([
		function (cb) {model.find(req.param("user"),cb);},
		function (res,cb) {
			if (!res || res.length < 1) {
				cb(404);
			} else {
				email = res[emailProperty];
				id = idProperty?res[idProperty]:res.id;
				reset_time = new Date().getTime() + resetExpire*60*1000;
				reset_code = sha1(email + new Date().toString().split("").sort(function(){return Math.round(Math.random())-0.5;})).substr(0,8);
				// we just need the first 8 chars, any random code is fine
				// expires in 60 minutes
				// save the update
				model.save(idProperty?res[idProperty]:id,{password_reset_code:reset_code,password_reset_time:reset_time},cb);
			}
		},
		function(res,cb) {
			if (!cb && typeof(res) === "function") {
				cb = res;
			}
			mailer("passwordreset",req.lang||"en_US",{code:reset_code,email:email,id:id,request:req},from,email,attachments['passwordreset'],cb);
		}
	],function (err) {
		var code = 400;
		if (err) {
			if (typeof(err) === 'number') {
				code = err;
			} else if (err === "uninitialized" || err === "baddb") {
				code = 500;
			}
			done(code,err);
		} else {
			done(201);
		}
	});	
},
completePasswordReset = function (req,done) {
	var reset_code = req.param("code"), password = req.param("password"), id = req.param("user"), now = new Date().getTime();
	async.waterfall([
		function (cb) {model.find(id,cb);},
		function (res,cb) {
			if (!res) {
				cb(404);
			} else if (res.password_reset_code !== reset_code){
				cb("invalidresetcode");
			} else if (res.password_reset_time < now) {
				cb("expiredresetcode");
			} else if (!password) {
				cb("missingpassword");
			} else {
				model.save(idProperty?res[idProperty]:id,{password_reset_code:"X",password_reset_time:0,password:password},cb);
			}
		}
	],function (err) {
		var code = 400;
		if (err) {
			if (err === 404) {
				code = 404;
			} else if (err === "uninitialized") {
				code = 500;
			}
			done(code,err);
		} else {
			done(200);
		}
	});	
};

module.exports = {
	init: function (config) {
		model = config.user || DEFAULTS.model;
		transport = config.transport || DEFAULTS.transport;
		templates = config.templates || DEFAULTS.templates;
		resetExpire = config.resetExpire || DEFAULTS.resetExpire;
		proto = config.protocol || DEFAULTS.proto;
		mailer = smtp(transport,templates, config.styliner || DEFAULTS.styliner);
    attachments = config.attachments || DEFAULTS.attachments;
		emailProperty = config.emailProperty || DEFAULTS.emailProperty;
		from = config.from || DEFAULTS.from;
		idProperty = config.id || DEFAULTS.idProperty;
	},
	createPasswordReset: function (req,res,next) {
		rparam(req);
		createPasswordReset(req,function (code,message) {
			if (message === null || message === undefined || (typeof(message) === "number" && message === code)) {
				res.sendStatus(code);
			} else {
				res.status(code).send(message);
			}
		});
	},
	createPasswordResetNext: function (req,res,next) {
		rparam(req);
		createPasswordReset(req,function (code,message) {
			req.activator = req.activator || {};
			_.extend(req.activator,{code:code,message:message});
			next();
		});
	},
	completePasswordReset: function (req,res,next) {
		rparam(req);
		completePasswordReset(req,function (code,message) {
			res.status(code).send(message);
		});
	},
	completePasswordResetNext: function (req,res,next) {
		rparam(req);
		completePasswordReset(req,function (code,message) {
			req.activator = req.activator || {};
			_.extend(req.activator,{code:code,message:message});
			next();
		});
	},
	createActivate: function (req,res,next) {
		rparam(req);
		createActivate(req,function (code,message) {
			res.status(code).send(message);
		});
	},
	createActivateNext: function (req,res,next) {
		rparam(req);
		createActivate(req,function (code,message) {
			req.activator = req.activator || {};
			_.extend(req.activator,{code:code,message:message});
			next();
		});
	},
	completeActivate: function (req,res,next) {
		rparam(req);
		completeActivate(req,function (code,message) {
			res.status(code).send(message);
		});
	},
	completeActivateNext: function (req,res,next) {
		rparam(req);
		completeActivate(req,function (code,message) {
			req.activator = req.activator || {};
			_.extend(req.activator,{code:code,message:message});
			next();
		});
	}	
};
