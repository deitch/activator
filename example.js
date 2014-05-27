/*jslint node:true, nomen:true, debug:true */
/*global escape */

/*
 * this is sample code for usage of activator, but it is not a fully functioning example. For that, you would need smtp, template
 * email files, etc. For true working examples, see the test directory.
 */

var express = require('express'), request = require('supertest'),
app = express(), _ = require('lodash'), async = require('async'), smtp = require('smtp-tester'),
mail, fs = require('fs'),
activator = require('./lib/activator'), templates = __dirname+'/test/resources',
users = {
	"1": {id:"1",email:"me@you.com",password:"1234"}
},
users,
quote = function (regex) {
	/*jslint regexp:true */
  var ret = regex.replace(/([()[{*+.$^\\/\\|?])/g, '\\$1');
	/*jslint regexp:false */
	return(ret);
},
bodyMatcher = function (body,matcher) {
	/*jslint regexp:true */
	var ret = body.replace(/[\r\n]+/g,'').match(new RegExp(quote(matcher.replace(/[\r\n]+/g,'')).replace(/<%=[^%]+%>/g,'.*')));
	/*jslint regexp:false */
	return(ret);
},
userModel = {
	_find: function (login,cb) {
		var found = null;
		if (!login) {
			cb("nologin");
		} else if (users[login]) {
			cb(null,_.cloneDeep(users[login]));
		} else {
			_.each(users,function (val) {
				if (val && val.email === login) {
					found = val;
					return(false);
				}
			});
			cb(null,_.cloneDeep(found));
		}
	},
	find: function() {
		this._find.apply(this,arguments);
	},
	save: function (id,model,cb) {
		if (id && users[id]) {
			_.extend(users[id],model);
			cb(null);
		} else {
			cb(404);
		}
	}
}, 
userModelEmail = _.extend({},userModel,{find: function (login,cb) {
	this._find(login,function (err,res) {
		if (res && res.email) {
			res.funny = res.email;
			delete res.email;
		}
		cb(err,res);
	});
	}
}),
MAILPORT = 30111,
PORT = 30110,
URL = "http://localhost:"+PORT,
r = request(URL), 
url = "smtp://localhost:"+MAILPORT+"/gopickup.net/"+escape("GoPickup Test <test@gopickup.net>"),
createUser = function (req,res,next) {
	users["2"] = {id:"2",email:"you@foo.com",password:"5678"};
	req.activator = {id:"2",body:"2"};
	next();
},
splitTemplate = function (path) {
	/*jslint stupid:true */
	var content = fs.readFileSync(path,'utf8');
	/*jslint stupid:false */
	content = content.match(/^([^\n]*)\n[^\n]*\n((.|\n)*)/m);
	return(content);
},
genHandler = function(email,subject,path,data,cb) {
	if (!cb) {
		cb = data;
		data = null;
	}
	return function(rcpt,msgid,content) {
		var url, ret, re = new RegExp('http:\\/\\/\\S*'+path.replace(/\//g,'\\/')+'\\?code=([^\\s\\&]+)\\&email=(\\S+)\\&user=([^\\s\\&]+)');
		rcpt.should.eql(email);
		// check for the correct Subject in the email
		// do we have actual content to test? if so, we should ignore templates, because we do not have the request stuff
		if (data && data.text) {
			url = content.text.match(re);
			ret = _.object(["path","code","email","user"],url);
		}
		if (data && data.html) {
			url = content.html.match(re);
			ret = _.object(["path","code","email","user"],url);
		}
		if (!ret) {
			url = (content.text||content.html).match(re);
			ret = _.object(["path","code","email","user"],url);
		}
		cb(null,ret);
	};
},
aHandler = function (email,data,cb) {
	return genHandler(email,"Activate Email","/activate/my/account",data,cb);
},
rHandler = function(email,data,cb) {
	return genHandler(email,"Password Reset Email","/reset/my/password",data,cb);
},
createActivateHandler = function (req,res,next) {
	// the header is not normally set, so we know we incurred the handler
	res.set("activator","createActivateHandler");
	res.send(req.activator.code,req.activator.message);
},
completeActivateHandler = function (req,res,next) {
	// the header is not normally set, so we know we incurred the handler
	res.set("activator","completeActivateHandler");
	res.send(req.activator.code,req.activator.message);
},
createResetHandler = function (req,res,next) {
	// the header is not normally set, so we know we incurred the handler
	res.set("activator","createResetHandler");
	res.send(req.activator.code,req.activator.message);
},
completeResetHandler = function (req,res,next) {
	// the header is not normally set, so we know we incurred the handler
	res.set("activator","completeResetHandler");
	res.send(req.activator.code,req.activator.message);
};


mail = smtp.init(MAILPORT);		
app.use(express.bodyParser());
app.use(app.router);
app.get('/users',function (req,res,next) {
	res.send(200,users);
});
app.post('/usersbad',activator.createActivate);
app.post('/users',createUser,activator.createActivate);
app.post('/usersnext',createUser,activator.createActivateNext,createActivateHandler);
app.put('/users/:user/activate',activator.completeActivate);
app.put('/usersnext/:user/activate',activator.completeActivateNext,completeActivateHandler);
app.post('/passwordreset',activator.createPasswordReset);
app.put('/passwordreset/:user',activator.completePasswordReset);
app.post('/passwordresetnext',activator.createPasswordResetNext,createResetHandler);
app.put('/passwordresetnext/:user',activator.completePasswordResetNext,completeResetHandler);
app.listen(PORT);

activator.init({user:userModel,url:url,templates:templates});

var examples = {
	// run this function to do a regular activation
	activate: function () {
		var email, handler;
		async.waterfall([
			function (cb) {r.post('/users').expect(201,cb);},
			function (res,cb) {
				res.text.should.equal("2");
				email = users["2"].email;
				handler = aHandler(email,cb);
				mail.bind(email,handler);
			},
			function (res,cb) {
				mail.unbind(email,handler);
				r.put('/users/'+res.user+'/activate').type("json").send({code:res.code}).expect(200,cb);
			}
		],function () {
			console.log("done");
		});
	},
	// run this function to do a regular activation with a special handler
	activateHandler: function () {
		var email, handler;
		async.waterfall([
			function (cb) {r.post('/usersnext').expect('activator','createActivateHandler').expect(201,cb);},
			function (res,cb) {
				res.text.should.equal("2");
				email = users["2"].email;
				handler = aHandler(email,cb);
				mail.bind(email,handler);
			},
			function (res,cb) {
				mail.unbind(email,handler);
				r.put('/usersnext/'+res.user+'/activate').type("json").send({code:res.code}).expect('activator','completeActivateHandler').expect(200,cb);
			}
		],function () {
			console.log("done");
		});
	},
	// run this function to do a regular password reset
	passwordRest: function () {
		var email = users["1"].email, handler;
		async.waterfall([
			function (cb) {r.post('/passwordreset').type('json').send({user:"1"}).expect(201,cb);},
			function (res,cb) {handler = rHandler(email,cb); mail.bind(email,handler);},
			function (res,cb) {
				mail.unbind(email,handler);
				r.put('/passwordreset/'+res.user).type("json").send({code:res.code,password:"abcdefgh"}).expect(200,cb);
			}
		],function () {
			console.log("done");
		});		
	},
	// run this function to do a regular password reset with a special handler
	passwordResetHandler: function () {
		var email = users["1"].email, handler;
		async.waterfall([
			function (cb) {r.post('/passwordresetnext').type('json').send({user:"1"}).expect('activator','createResetHandler').expect(201,cb);},
			function (res,cb) {handler = rHandler(email,cb); mail.bind(email,handler);},
			function (res,cb) {
				mail.unbind(email,handler);
				r.put('/passwordresetnext/'+res.user).type("json").send({code:res.code,password:"abcdefgh"}).expect('activator','completeResetHandler').expect(200,cb);
			}
		],function () {
			console.log("done");
		});		
	}
};
