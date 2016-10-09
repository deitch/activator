# Activator

## Overview
activator is the **simple** way to handle user activation and password reset for your nodejs apps!

Example:
    
    var express = require('express'), app = express(), activator = require('activator');
		
		activator.init({user:userModel,transport:smtpURL,from:"activator@github.com",templates:mailTemplatesDir});
		
		app.user(app.router);
		
		// activate a user
		app.post("/user",activator.createActivate);
		app.put("/user/:user/active",activator.completeActivate);
		
		// reset a password
		app.post("/passwordreset",activator.createPasswordReset);
		app.put("/passwordreset/:user",activator.completePasswordReset);

## Breaking Changes

#### Templates
Activator version >= 3.0.0 uses template _drivers_ instead of a simple path. Do **not** upgrade until you read the documentation on templates and drivers.

#### Express versions
Activator version >= 1.0.0 works **only** with express >=4.0.0

Activator version <1.0.0 works **only** with express <4.0.0

#### Algorithms
Activator version >= 2.0.0 works **only** with [JSON Web Tokens](https://tools.ietf.org/html/rfc7519) and ignores **completely** the user database fields for password reset code and password reset time.

Activator version < 2.0.0 work **only** with custom fields in the database to store the password reset code, password reset time, and activation code.

**The user model used for activator < 2.0.0 is incompatible with the one for activator >= 2.0.0**. 

The signature prior to 2.0.0 was:

````javascript
user = {
	find(id,callback),
	save(id,model,callback)
}
````

The signature beginning with 2.0.0 is:

````javascript
user = {
	find(id,callback),
	activate(id,callback),
	setPassword(id,password,callback)
}
````



## Purpose
Most interaction between users and your Web-driven service take place directly between the user and the server: log in, send a message, join a group, post an update, close a deal, etc. The user logs in by entering a username and password, and succeeds (or doesn't); the user enters a message and clicks "post"; etc.

There are a few key interactions - actually, mainly just two - that take place using side channels and with delays:

* New user creation & activation
* Password reset

In both of these cases, the user does something directly on the Web (or via your mobile app or API), then something happens "on the side", usually via email or SMS: a confirmation email is sent; a password reset token is texted; etc.

This process is quite burdensome to build into your app, since it breaks the usual "request-response" paradigm.

*Activator* is here to make this process easier.

## Process
### Activator Services
Activator provides express middleware that to perform user activation - create and complete - and password reset - create and complete. It handles one-time link creation, link expiry, validation and all the other parts necessary to make user activation and password reset turnkey.

*activator* also does not tell you what the email you send out should look like; you just provide a template, and activator fills it in. 

Here are activator's steps in detail.

### User Activation
For user creation, the steps are normally as follows:

1. User creates a new account on your Web site / app
2. System creates an "activation email" that contains a one-time link and sends it to the registered email
3. User clicks on the link, thus validating the email address

Most sites call steps 2-3 "user activation". Activator calls step 2 "create an activation" and step 3 "complete an activation".

When you use activator, the steps are as follows:

1. User creates a new account on your Web site / app
2. You include `activator.createActivate()` as part of the creation middleware
3. *activator* takes the user email address from the new user account, a template from the templates directory set on initialization, and the URL from initialization, creates a one-time activation key, composes an email and sends it.
4. The user receives the email and clicks on the link
5. You included `activator.completeActivate()` as the express middleware handler for the path in the URL
6. *activator* checks the one-time activation key and other information against the user account, marks the account as activated


### Password Reset
For password reset, the steps are normally as follows:

1. User clicks "forgot password" on your Web site / app
2. System creates a "password reset email" that contains a one-time link and sends it to the registered email for the account
3. User clicks on the link, allowing them the opportunity to set a new password

Activator calls step 2 "create a password reset" and step 3 "complete a password reset"

When you use activator, the steps are as follows:

1. User selects "reset password" on your Web site / app
2. You include `activator.createPasswordReset()` as the express middleware handler for the path
3. *activator* takes the user email address from the user account, a template driver function to get each email template, and the URL from initialization, creates a one-time password reset key, composes an email and sends it.
4. The user receives the email and clicks on the link
5. You included `activator.completePasswordReset()` as the express middleware handler for the path in the URL
6. *activator* checks the one-time password reset key and other information against the user account, and then allows the user to reset the password
7. Optionally, activator sends a "password reset complete" email.



### How To Use It
To use *activator*, you select the routes you wish to use - activator does not impose any special routes - and use activator as middleware. Of course, you will need to tell activator how to do several things, like:

* How to find a user, so it can check for the user
* How to mark a user as activated, once they have sent the correct verified code
* How to change a user's password, once they have sent the correct verified code within time and a new password
* How to get the email template to use for activation and password reset emails
* What URL the user should be using to activate or reset a password. The URL is included in the email, since the user normally clicks on a link.

All of these are described in greater detail below.


## Installation
Installation is simple, just install the npm module:

    npm install activator


## Usage
First *initialize* your activator instance, then use its methods to activate users and reset passwords

### Initialization
In order for activator to work, it needs to be able to read your user instances and save to them. It also needs to be able to compose and send emails.

    activator = require('activator');
		activator.init(config);

The `config` object passed to `activator.init()` **must** contain the following keys:

* `user`: object that allows activator to find a user object, indicate activation, set a new password. See below.
* `emailProperty`: the property of the returned user object that is the email of the recipient. Used in `user.find()`. Defaults to "email". Use dot notation to specify a property not at the root, e.g. "profiles.local.email"
* `transport`: string or pre-configured nodemailer transport that describes how we will send email. See below.
* `templates`: a function to request templates. See below.
* `from`: string representing the sender for all messages
* `signkey`: A string used to sign all of the JWT with HS256. If it is not present, activator has no way of confirming key signing between processes or from one startup of the process to the next.

Optionally, config can also contain:

* `id`: the property that contains the ID in a user when it is found using `find`. Use dot notation to specify a property not at the root, e.g. "profiles.local.remoteid". See below for `user.save()`
* `attachments`: object with attachments to include in messages. See below for detailed attachment formats.
* `styliner`: boolean that turns on styliner for template compilation
* `sendPasswordResetComplete`: boolean, determines whether or not to send an email when password reset is complete. Defaults to false.



##### user
The user object needs to have several required methods, and may have several optional others, with the following signatures:

    user.find(id,callback);
    user.activate(id,callback);
    user.setPassword(id,password,callback);
    user.generate();
    user.validatePassword(password[,cb]);

###### find a user
**Required**

    user.find(id,callback);

Where:

* `id`: string with which the user can be identified to your system. activator doesn't care if it is an email address, a user ID, or the colour of their parrot. `user.find()` should be able to find a user based on it. Where activator takes this string from depends on the part of the request:
    * `createActivate()`: From the `request` as `req.activator.id` or, if not found, `req.user.id`
    * Everywhere else: From the `request` as the parameter user, i.e. `req.param("user")`.
* `callback`: the callback function that `user.find()` should call when complete. Has the signature `callback(err,data)`. If there is an error, `data` should be `null` or `undefined`; if there is no error but no users found, both `err` *and* `data` **must** be `null` (not `undefined`). If an object is found, then `data` **must** be a single JavaScript object. The `data` object should have:
    - a property containing the user id. By default, it is named `id`, but you can override it with `config.id`.
    - a property containing the email address. By default, it is named `email`, but you can override it with `config.emailProperty`.
    - a property named `activation_code` if the user has a stored activation code.
    - a property named `password_reset_code` if the user has a stored password reset code.
    - a property named `password_reset_time` if the user has a stored password reset time.


###### activate a user
**Required**

    user.activate(id,callback);

Where:

* `id`: ID of the user to activate. 
* `callback`: the callback function that `user.activate()` should call when complete. Has the signature `callback(err)`. If the save is successful, `err` **must** be `null` (not `undefined`).

activator does not care how you mark the user as activated or not. It doesn't even care of you never check activation (but that is a *really* bad idea, right?). All it cares is that you give it a way to indicate successful activation.

###### set a password
**Required**

    user.setPassword(id,password,callback);

Where:

* `id`: ID of the user to change password 
* `password`: new password for the user
* `callback`: the callback function that `user.activate()` should call when complete. Has the signature `callback(err)`. If the save is successful, `err` **must** be `null` (not `undefined`).

###### generate a password
*Optional*

    user.generate();

If provided, `user.generate()` will be called without paramters. It is expected to generate a unique password for a user. The method is called synchronously, so it should be quick. It also has no idea about the identity of the user for whom the password is being generated; that knowledge only serves to weaken the password.

If `user.generate()` exists, any passwords sent by the user in `completePasswordReset` **will be ignored**. Use this to enforce your own password policies.

###### validate a password
*Optional*

    user.validatePassword(password[,cb]);

If provided, `user.validatePassword()` will validate policy on a new user password. `user.validatePassword()` may be called synchronously or asynchronously, depending on the signature:

* `validatePassword(password)`: synchronous. Should return the results of validation. If valid, should return `true`; if invalid should return either `false` or optionally a string with an error message or an array of error messages.
* `validatePassword(password,callback)`: asynchronous. Should call `callback` with the results of validation. 

For async validation, the signature for the callback should be

````javascript
callback(err,valid);
````

where:

* `err`: any error incurred
* `valid`: the results of validation. If valid, should be `true`; if invalid, should be either `false` or optionally a string with an error message or an array of error messages.

If `user.validatePassword()` does not exist, no password checking is done.


##### User ID

What ID does it use when activating or setting the password?

* If you passed an `id` parameter to `activator.init(config)`, then it is that property of the user. For example, `activator.init({id:'uid'})` means that when activator does `user.find('me@email.com')` and the returned object contains `{uid:12345}`, then activator will activate as `user.activate(12345)`
* If you did not pass an `id` parameter, then it is the exact same search term as used in `user.find()`. else it is the search term used as `login` in `user.find(login)`. For example, if activator does `user.find('12bc5')` then it will also do `user.activate('12bc5')`.



##### transport
There are 2 ways activator can send email: SMTP (default) or a passed-in transport.

###### SMTP
If you are using SMTP - which is the default - all you need to pass in is a string describing how activator should connect with your mail server. It is structured as follows:

    protocol://user:pass@hostname:port/domain?secureConnection=true
		
* `protocol`: normally "smtp", can be "smtps"
* `user`: the user with which to login to the SMTP server, if authentication is required.
* `pass`: the password with which to login to the SMTP server, if authentication is required.
* `hostname`: the hostname of the server, e.g. "smtp.gmail.com".
* `port`: the port to use.
* `domain`: the domain from which the mail is sent, when the mail server is first connected to.
* `secureConnection`: the use of SSL can be guided by the query parameter "secureConnection=true".

###### Other
If you prefer a different service - or you want to override the SMTP configuration - then instead of passing a URL string to transport, you can pass in a preconfigured nodemailer transport object. Since activator uses nodemailer under the covers, the transport is a pass-through.

And, yes, you can even use the nodemailer SMTP transport instead of a URL string, if you prefer. Once activator receives a configured transport object, rather than a string, it doesn't care what it is as long as it works.

How would you do it? Well, SMTP would normally look like this:

    activator.init({transport:"smtp://user:pass@mysmtp.com/me.com"});
		
Or similar. 

To use a pre-configured transport, you need to:

1. Include the transport module
2. Configure the transport
3. Initialize activator with the transport

Here is an SMTP example:

    var smtpTransport = require('nodemailer-smtp-transport'), mailer = require('nodemailer');
		var transport = mailer.createTransport(smtpTransport(options));
		activator.init({transport:transport});
		
Of course, because the 'nodemailer-smtp-transport' is the default in nodemailer, the above example is **identical** to just passing in a URL string, but you can work whichever way works for you.

Here is an Amazon Simple Email Service (SES) example:

    var sesTransport = require('nodemailer-ses-transport'), mailer = require('nodemailer');
		var transport = mailer.createTransport(sesTransport(options));
		activator.init({transport:transport});
		
In all cases, it is up to *you* to set the `options` to create the transport.

And if all you know (or want to know) is SMTP, then just use the default SMTP connection with a URL string.

For details aboute nodemailer's transports, see the nodemailer transports at http://www.nodemailer.com/#available-transports

##### templates
A function to request each email template. This function has the following signature:

```js
activator.init({
    templates: function (type, lang, callback) { },
    ...
})
```

* `type`: the type of template, e.g. `activate` or `passwordreset`
* `lang`: the language for the email template, using the i18n specification format, e.g. `en`, `en_US`, etc.
* `callback`: the function to return the requested text. Optionally this function can return a promise.

The driver _normally_ is expected to be flexible in returning less-specific templates, if the more specific one is not found. However, it is up to the driver to decide if a less-specific template is valid.

For example, if we look for the text template for activation for language `en_US`, we will call:

````javascript
templates('activate', 'en_US', function (err,result) {}); 
````

If a precise driver for `en_US` is not found, normally you would return one for `en`, and failing that, a default. However, **it is up to the driver implementation to decide** if that makes sense. One driver might use that fallback, while another might decide that only exact matches to `en_US` are acceptable.

`activator` ships with a default driver to automatically get templates from a filesystem path. To use the default file templates driver, initialize as:

```js
activator.init({
    templates: activator.templates.file(pathToTemplates),
    ...
})
```


How does `activator` know which language to use when requesting a template? Simple, just set it on `req.lang`. You might have retrieved that from your user preferences, or from your application's default, or perhaps from the http header `Accept-Language`. Either way, you should set it in earlier middleware:

````JavaScript
		app.use(function(req,res,next){
			req.lang = myLang; // Set your lang here
		});
		app.use(app.router);
		app.post('/users',activator.createActivate); // etc.
````


The signature of the callback by the template driver should be as follows:


````javascript
function(err,result) {...}
````

where:

* `err`: errors, if any; `null` if not
* `result`: content of the templates

The templates content parameter to the callback should be an object with properties for each template type:

````json
{
  "text": contentOfTextTemplate,
  "html": contentOfHtmlTemplate
}
````

It is up to the template driver to decide which types to return - one, both, neither. Activator will look at the returned object:

* if it is null, send no email
* if it is an object with just `text` property, use that to send a text email
* if it is an object with just `html` property, use that to send an html email
* if it is an object with both `text` and `html`, use that to send an email with both text and html


Details on template structure and how to use the templates file driver are below.




##### attachments
The initialization object property `attachments` is an object with 0, 1 or 2 keys:

* `activate`: the attachment to add to activation messages
* `passwordreset`: the attachment to add to password reset messages

The value for each of these attachments is an object matching the `attachments` object format from https://github.com/andris9/Nodemailer#attachments

##### styliner
The boolean value for the initialization object property styliner specifies whether the [styliner](http://styliner.slaks.net/) libary should be used to compile your html templates. This libary provides inlining of css styles from `<style>` tags for better Gmail support. 

### Responses and Your Handlers
All of the middleware available in activator can function in one of two modes:

1. Send responses - this is usually used by Ajax, e.g. `res.send(200,"success")` or `res.send(401,"invalidcode")`
2. Pass responses - pass the responses on to your middleware, where you can do what you wish


Here are two examples, one of each:

````JavaScript
app.post("/users",createUser,activator.createActivate);		// will send the success/error directly
app.post("/users",createUser,activator.createActivateNext,handler);		// will call next() when done
````

When the middleware is done, if it ends in "Next", it will store the results in a `req.activator` object and then call `next()`.

````JavaScript
req.activator = {
	code: 500,								// or 401 or 400 or 201 or 200 or ....
	message: "uninitialized"	// of null/undefined, or "invalidcode" or ....
}
````


### Activation
Activation is the two-step process wherein a user first *creates* their account and *then* confirms (or activates) it by clicking on a link in an email or entering a short code via SMS/iMessage/etc.

activator provides the route handlers to create the activation code on the account and send the email, and then confirm the entered code to mark the user activated.

activator does **not** create the user; it leaves that up to you, since everyone likes to do it just a little differently.


#### Create an activation
Activation is simple, just add the route handler *after* you have created the user:

````JavaScript
app.post("/users",createUser,activator.createActivate); 								// direct send() mode
app.post("/users",createUser,activator.createActivateNext,handler); 		// save results in req.activator and call next() mode
````

`activator.createActivate` needs access to several pieces of data in order to do its job:

* `id`: It needs the ID of the user, so that it can call `user.save(id,data)`
* `response.body`: Since `createUser` (in the above example) or anything you have done to create a user might actually want to send data back, `createActivate()` needs to be able to know what the body you want to send is, when it is successful and calls `res.send(201,data);`

`createActivate()` will look for these properties on `req.activator`. 

````JavaScript
req.activator = {
	id: "12345tg", // the user ID to pass to createActivate()
	body: "A message" // the body to send back along with the successful 201
}
````

If `createActivate()` or `createActivateNext()` cannot find `req.activator.id` or `req.user.id`, it will incur a `500` error.


#### Complete an activation
Once the user actually clicks on the link, you need to complete the activation:

````JavaScript
app.put("/users/:user/activation",activator.completeActivate);								// direct res.send() mode
app.put("/users/:user/activation",activator.completeActivateNext,handler);		// save results and call next() mode
````

activator will return a `200` if successful, a `400` if there is an error, along with error information, and a `404` if it cannot find that user.

activator assumes the following:

1. The express parameter `user` (i.e. `/users/:user/whatever/foo`) contains the user identifier to pass to `user.find()` as the first parameter. It will retrieve it using `req.param('user')`
2. The `req` contains the JWT for the activation. It will look in three places. First, it will check `req.headers.Authorization` for the JWT from the message in `Bearer` format, following the RFC. If it does not find it in the `Authorization` header, it will look in the query `req.query.authorization`, and then in the body `req.body.authorization`.

If it is successful activating, it will return `200`, a `400` if there is an error (including invalid activation code), and a `404` if the user cannot be found.

### Password Reset
Password reset is a two-step process in which the user requests a password reset link, normally delivered by email, and then uses that link to set a new password. Essentially, the user requests a time-limited one-time code that is delivered to the user and allows them to set a new password.

#### Create a password reset
Creating a password reset is simple, just add the route handler:

````JavaScript
app.post("/passwordreset",activator.createPasswordReset);							// direct res.send() mode
app.post("/passwordreset",activator.createPasswordResetNext,handler);	// save data and call next() mode
````

When done, activator will return a `201` code and a message whose text content is the URL to be used to reset the password.

Activator assumes that the login/email/ID to search for will be in `req.param("user")`.

#### Complete a password reset
Once the user actually clicks on the link, you need to complete the password reset:

````JavaScript
app.put("/users/:user/passwordreset",activator.completePasswordReset);								// direct res.send() mode
app.put("/users/:user/passwordreset",activator.completePasswordResetNext,handler);		// save response and call next() mode
````

activator will return a `200` if successful, a `400` if there is an error, along with error information, and a `404` if it cannot find that user.

activator assumes the following:

1. The express parameter `user` (i.e. `/users/:user/whatever/foo`) contains the user identifier to pass to `user.find()` as the first parameter. It will retrieve it using `req.param('user')`
2. The `req` contains the JWT for the activation. It will look in three places. First, it will check `req.headers.Authorization` for the JWT from the message in `Bearer` format, following the RFC. If it does not find it in the `Authorization` header, it will look in the query `req.query.authorization`, and then in the body `req.body.authorization`.

If it is successful resetting the password, it will return `200`, a `400` if there is an error (including invalid code), and a `404` if the user cannot be found.


### Templates Format
In order to send an email (yes, we are thinking about SMS for the future), activator needs to have templates. 

Each template content, as returned by a template driver, must have 3 or more lines. The first line is the `Subject` of the email; the second is ignored (I like to use '-----', but whatever works for you), the third and all other lines are the content of the email.

Remember, activator is a *server-side* product, so it really has no clue if the page the user should go to is https://myserver.com/funny/page/activate/fooooo.html or something a little more sane like https://myserver.com/activate.html

How does activator know what to put in the email? **It doesn't; you do!**. You put the URL in the templates for passwordreset and activate. 

What you can do is have activator embed the necessary information into the templates before sending the email. Each template follows a simplified [EJS](http://embeddedjs.com) style (very similar to PHP). All you need to do is embed the following anywhere (and as many times as you want) inside the template:

    <%= abc %>
		
and every such instance will be replaced by the value of `abc`. So if `abc = "John"`, then 

    This is an email for <%= abc %>, 
		   hi there <%= abc %>.

Will be turned into

    This is an email for John,
		   hi there John.
			 
So what variables are available inside the templates?

* `code`: the activation or password reset JSON Web Token
* `authorization`: the activation or password reset JSON Web Token
* `email`: the email of the recipient user
* `id`: the internal user ID of the user
* `password`: the new password for the user, especially on completing password reset. **We do NOT recommend putting passwords in emails!! It destroys forward secrecy!** That having been said, if you want to cut the floodgates open, that is your choice. Perhaps this is only for a test or internal system.
* `request`: the `request` object that was passed to the route handler, from which you can extract lots of headers, for example the protocol at `req.protocol` or the hostname from `req.headers.host`. 

So if your password reset page is on the same host and protocol as the request that came in but at "/reset/my/password", and you want to include the code in the URL as part of a query but also add it to the page, you could do:


    Hello,
		
		You have asked to reset your password for MySite. To reset your password, please click on the following link:
		
		<%= request.protocol %><%= request.headers.host %>/reset/my/password?code=<%= code %>&user=<%= id %>
		
		Or just copy and paste that link and enter your code as <%= code %>.
		
		Thanks! 
		From: the MySite team


### Templates File Driver
To use the templates file driver, the templates must be simple text files that contain the text or HTML to send.

The templates should be in the directory passed to `activator.templates.file(path)` as the first (and only) parameter. It **must** be an absolute directory path (how else is activator going to know, relative to what??). Each template file should be named according to its function: "activate", "passwordreset" or "completepasswordreset". You can, optionally, add ".txt" to the end of the filename, if it makes your life easier.

The contents of the templates files themselves follow the content standard for all templates, described above. The file driver makes no changes to the content.

When the file driver is requested to retrieve a template, it will look in the provided directory:

* If it finds an html file, it will return an html template, causing activator to send html email
* If it finds a text file, it will return a text template, causing activator to send text email
* If it finds both, it will return both templates, causing activator to send both in an email.

How does it know which file is which? Simple: **filename extension**.

* `activate.html` - use this as an HTML template for activation
* `passwordreset.html` - use this as an HTML template for password reset
* `completepasswordreset.html` - use this as an HTML template to indicate that password reset has been completed
* `activate.txt` - use this as a text template for activation
* `passwordreset.txt` - use this as a text template for password reset
* `completepasswordreset.txt` - use this as a text template to indicate that password reset has been completed
* `activate` - use this as a text template for activation
* `passwordreset` - use this as a text template for password reset
* `completepasswordreset` - use this as a text template to indicate that password reset has been completed

Notice that there are two options for text templates: no filename extension (e.g. `activate`) and text extension (e.g. `activate.txt`). How does it know which one to use when both are there? Simple:

1. Use the filename without an extension. If it does not exist:
2. Use the filename with the `.txt` extension.

The content format of both kinds of templates (html and text) is the same as described for all templates and has all of the same variables.


#### Localized templates

The file driver (like activator in general) supports localized templates. You can have one template for the locale `en_GB`, a separate one for `fr` and a third for `he_IL`. Just create the files with the correct name as an extension: filename type (e.g. `activate`), followed by `_` followed by the locale string (e.g. `en_GB` or `fr`) following by the optional filetype extension (nothing or `.txt` or `.html`).

Here are some examples:

* `activate_en_GB.txt` - text template for locale `en_GB`
* `activate_en_GB` - text template for locale `en_GB`
* `activate_en_GB.html` - html template for locale `en_GB`
* `activate_fr.html` - html template for locale `fr`, will be used when the language is `fr` or `fr_`*anything* that is not matched
* `activate` - fallback for all unmatched locales

The search pattern is as follows.

1. Look for an exact match of the locale, e.g. for `en_GB`, look for `activate_en_GB`
2. Look for a language match, e.g. for `en_GB`, look for `activate_en`
3. Look for a default file, e.g. for `en_GB`, look for `activate`


## Example
An example - just a simplified and stripped down version of the tests - is available in `./example.js`. It can be run via `node ./example.js`

## Testing
To run the tests, from the root directory, run `npm test`.

## License
Released under the MIT License. 
Copyright Avi Deitcher https://github.com/deitch
