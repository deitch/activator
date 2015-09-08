/*jslint node:true, nomen:true */

module.exports = function(url, templates){
	var sendmail = require('./sendmail')(url), mailcomposer = require('./mailcomposer');
	mailcomposer.init(templates);
	
	return function(type,lang,data,from,to,attachments,callback) {
		mailcomposer.compile(type,lang,data,function(subject,text,html){
			if (subject && (text||html)) {
				sendmail(from,to,subject,text,html,attachments,callback);
			} else {
				callback("missingmailfile");
			}
		});		
	};
};