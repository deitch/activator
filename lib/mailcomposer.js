/*jslint node:true, nomen:true, unused:vars */
var shouldUseStyliner = false, Styliner = require('styliner'), _ = require('lodash'), templates,
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
			let subjectTemplate, textContentTemplate, htmlContentTemplate;
			if (err) {
				callback(err);
			} else if (!res) {
				callback(null,null);
			} else {
				// we have the saved mail template - it might be html or text
				subjectTemplate = _.template((res.text||res.html).subject);
				textContentTemplate = res.text ? _.template(res.text.content) : function () {return null;};
				htmlContentTemplate = res.html ? _.template(res.html.content) : function () {return null;};
				
				if(shouldUseStyliner && res.html) {
					styliner.processHTML(htmlContentTemplate(config)).then(function(processedSource) {
						callback(subjectTemplate(config), textContentTemplate(config), processedSource);
					});
				} else {
					callback(subjectTemplate(config),textContentTemplate(config),htmlContentTemplate(config));
				}

			}
		});
	}
};