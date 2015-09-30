/*jslint node:true */
var mailer = require('nodemailer');


module.exports = function(turl) {
  var url, transport, host, port, auth, protocol, sysopts,
  parts, domain, secure;
	if (typeof(turl) === "string") {
		url = require('url').parse(turl||"", true);	  // do we have a proper URL?
	  url.protocol = url.protocol || "smtp:";
	  url.host = url.host || "localhost";
	  url.port = url.port || "25";
	  url.path = url.path || "/localhost";
  
	  protocol = url.protocol.replace(/:$/,"").toUpperCase();
	  host = url.host.split(":")[0];
	  port = parseInt(url.port,10);
	  parts = url.path.split(/\//);
	  domain = parts[1];
	  secure = url.query.secureConnection || false;
	  sysopts = { host: host, port:port, name: domain, secure: secure };
	  if (url.auth) {
	    auth = url.auth.split(":");
	    sysopts.auth = {user:auth[0],pass:auth[1]};
	  }

	  // create reusable transport method (opens pool of SMTP connections)
	  transport = mailer.createTransport(sysopts);		
	} else {
		transport = turl;
	}

  return function(from,to,subject,text,html,attachments,cb) {
    var opts = {
      from: from,
      to: to,
      subject: subject
    };
		if (text) {
			opts.text = text;
		}
    if(attachments) {
			opts.attachments = attachments;
		}
		if (html) {
			opts.html = html;
		}
    transport.sendMail(opts,cb);
  };
};
