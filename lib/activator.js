/*jslint node:true, nomen:true */
/*jshint unused:vars */

// with defaults
var async = require('async'), smtp = require('./mailer'), _ = require('lodash'), mailer, attachments,
rparam = require('./params'), jwt = require('jsonwebtoken'),
signkey,
getObjectProperty = function(object, property) {
	var propertyPath = property.split('.'), current = object;
	while (propertyPath.length > 0) {
		current = current[propertyPath.shift()];
		if (!current) return undefined;
	}
	return current;
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
	idProperty: "id"
},
model = DEFAULTS.model, 
transport, 
from,
templates,
emailProperty,
idProperty,
resetExpire, proto,
getAuthCode = function (req) {
	// first check for Authorization header
	var ret, header = req.headers.Authorization || req.headers.authorization, lparam = req.param("authorization"),
	uparam = req.param("Authorization");
	if (header) {
		ret = (header.match(/^Bearer\s+(\S+)$/) || [])[1];
	} else  {
		ret = lparam || uparam;
	}
	return ret;	
},
createActivate = function (req,done) {
	// add the activation code using JSON Web Tokens
	var id = (req.activator?req.activator.id:null) || (req.user?req.user.id:null);
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
					var email = getObjectProperty(res, emailProperty),
					id = getObjectProperty(res,idProperty),
					code = jwt.sign({sub:email,purpose:"activation"},signkey,{algorithm:"HS256"});
					if (!email) {
						cb("missingemail");
					} else if (!id) {
						cb(404);
					} else {
						mailer("activate",req.lang||"en_US",{code:code,authentication:code,email:email,id:id,request:req},from,email,attachments.activate,cb);
					}
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
				done(201,req.activator?req.activator.body:undefined);
			}
		});
	}
},
completeActivate = function (req,done) {
	var code = getAuthCode(req), id = req.param("user");

	async.waterfall([
		function (cb) {model.find(id,cb);},
		function (res,cb) {
			if (!res) {
				cb(404);
			} else {
				try {
					var decoded = jwt.verify(code,signkey,{algorithms:"HS256"});
					if (decoded.purpose !== "activation") {
						throw new Error("invalid purpose");
					}
					if (decoded.sub !== getObjectProperty(res, emailProperty)) {
						throw new Error("invalidactivationcode");
					}
					model.activate(idProperty?getObjectProperty(res, idProperty):id,cb);
				} catch (e) {
					cb("invalidcode");
				}
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
				var email = getObjectProperty(res, emailProperty),
				id = idProperty?getObjectProperty(res, idProperty):res.id,
				reset_code = jwt.sign({sub:email,purpose:"resetpassword"},signkey,{algorithm:"HS256"});
				mailer("passwordreset",req.lang||"en_US",{code:reset_code,authorization:reset_code,email:email,id:id,request:req},from,email,attachments.passwordreset,cb);
			}
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
	var reset_code = getAuthCode(req), password = req.param("password"), id = req.param("user"), now = Math.floor(new Date().getTime()/1000);
	async.waterfall([
		function (cb) {model.find(id,cb);},
		function (res,cb) {
			if (!res) {
				cb(404);
			} else if (!password) {
				cb("missingpassword");
			} else {
				try {
					var decoded = jwt.verify(reset_code,signkey,{algorithms:"HS256"});
					if (decoded.purpose !== "resetpassword" || decoded.sub !== getObjectProperty(res, emailProperty)) {
						throw new Error("invalidresetcode");
					} else if (decoded.iat < now - resetExpire*60) {
						throw new Error("expiredresetcode");
					}
					model.setPassword(idProperty?getObjectProperty(res, idProperty):id,password,cb);
				} catch (e) {
					cb(e);
				}
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
		signkey = config.signkey;
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
			if (message === null || message === undefined || (typeof(message) === "number" && message === code)) {
				res.sendStatus(code);
			} else {
				res.status(code).send(message);
			}
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
