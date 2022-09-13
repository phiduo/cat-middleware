require('dotenv').config()
const routes = require('./src/routes')
const fs = require("fs");

const lti = require('ltijs').Provider

// setup LTI tool and database
lti.setup(process.env.LTI_KEY,
    {
        url: 'mongodb://' + process.env.DB_HOST + '/' + process.env.DB_NAME + '?authSource=admin',
        connection: {user: process.env.DB_USER, pass: process.env.DB_PASS}
    }, {
        devMode: true
    })

// redirect to /start-quiz on successful launch
lti.onConnect(async (token, req, res) => {
    lti.redirect(res, '/start-quiz')
})

lti.app.use(routes)

// define setup function
const setup = async () => {
    await lti.deploy({port: process.env.PORT})

    // load LMS configuration from lms-config.json
    const lmsConfig = JSON.parse(fs.readFileSync(require.resolve('./lms-config.json'), 'utf8'))

    // register LMS in the tool
    await lti.registerPlatform({
        url: lmsConfig.url, // URL of the LMS
        name: lmsConfig.name,
        clientId: lmsConfig.clientId, // provided by the LMS
        authenticationEndpoint: lmsConfig.authenticationEndpoint, // provided by the LMS
        accesstokenEndpoint: lmsConfig.accesstokenEndpoint, // provided by the LMS
        authConfig: lmsConfig.authConfig // key provided by the LMS
    })
}

setup()
