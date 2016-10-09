/*jslint node:true, nomen:true, unused:vars */
var shouldUseStyliner = false, Styliner = require('styliner'), templates,
styliner = new Styliner('./');

module.exports = {
	init : function (templatesDriver, styliner) {
		templates = templatesDriver;
		shouldUseStyliner = styliner || false;
	},
	get : function (type,lang,callback) {
		return templates(type,lang,callback);
	},
	compile: function (type,lang,config,callback) {
		this.get(type,lang,function (err,res) {
			if (err) {
				callback(err);
			} else if (!res) {
				callback(null,null);
			} else {
				// we have the saved mail template - it might be html or text
				if(shouldUseStyliner && res.html) {
					styliner.processHTML(res.html.content(config)).then(function(processedSource) {
						callback((res.text||res.html).subject(config), res.text?res.text.content(config):null, processedSource);
					});
				} else {
					callback((res.text||res.html).subject(config),res.text?res.text.content(config):null,res.html?res.html.content(config):null);
				}

			}
		});
	}
};