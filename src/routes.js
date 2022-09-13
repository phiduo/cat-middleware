const router = require('express')()
const path = require('path')
const express = require('express')
const axios = require('axios')
const fs = require("fs")

// set ejs as view engine
router.set('view engine', 'ejs')
// specify view folders
router.set('views', [path.join(__dirname, '..', 'views'), path.join(__dirname, '..', 'views/question-views')])

router.use(express.json())
router.use(express.urlencoded({ extended: true }))

const lti = require('ltijs').Provider

// own root URL
const ownRootUrl = 'https://cat.lhr.rocks' // replace with localhost if middleware is not hosted

// URLs of CAT-Module
const catRootUrl = 'http://localhost:8000' // URL of the CAT-Module
const createQuizUrl = catRootUrl + '/quiz' // URL to create a new quiz

/**
 *  Starts a quiz with the quiz configuration loaded from the quiz-config.json, by sending this configuration to the
 *  CAT-Module. As a result, the CAT-Module creates a quiz entity and passes it back to the middleware as the response.
 *  With the given quizId of that quiz entity, /render/quizzes/:quizId is called to render the first question of that quiz.
 */
router.get('/start-quiz', async (req, res) => {

    /*
    For consistent testing, difficulty reset endpoint is called to reset difficulty for questions in CAT-Module to the
    original difficulty they had before the quiz, as the questions' difficulties are automatically calibrated
    (and therefore changed) by the CAT-Module after every completed quiz.
     */
    let quizTopic = 'algebra' // topic for which the questions should be reset
    const resetDifficultyUrl = catRootUrl + `/reset-difficulty/topic/${quizTopic}`
    await axios.post(resetDifficultyUrl).then((response) => {
        console.log(response.data)
    }, (error) => {
        console.log(error);
    });

    // quiz configuration to be sent to CAT-Module, configuration loaded from quiz-config.json
    const quizConfiguration = JSON.parse(fs.readFileSync(require.resolve(`../quiz-config.json`), 'utf8'))

    // request CAT-Module to create a new quiz and redirect to render first question of that newly created quiz
    await axios.post(createQuizUrl, quizConfiguration).then((response) => {
        let quizId = response.data.quizId
        lti.redirect(res, `/render/quizzes/${quizId}`, { query: { correct: '-1' } })
        // here, the value of correct does not matter as it is ignored when requesting the first question of a quiz
    }, (error) => {
        console.log(error);
    });
})

/**
 *  Renders the next question of a quiz with given quizId.
 *  Next question is provided when the answer to the current question is sent to the CAT-Module.
 */
router.get('/render/quizzes/:quizId', async (req, res) => {

    let quizId = req.params.quizId

    console.log(`>> Receiving request at /render/quizzes/${quizId}`)
    console.log(`>> The quizId is ` + quizId)

    let questionId

    console.log(`>> The answer to the current question was evaluated as ` + req.query.correct)

    // request next question from cat-engine
    let catNextQuestionUrl = `${createQuizUrl}/${quizId}/question`
    console.log(`>> Sending request to ` + catNextQuestionUrl)
    await axios.post(catNextQuestionUrl, {
        "isCorrect": req.query.correct  // the correctness of the current answer
    }).then((response) => {
        // save questionId from next question received
        questionId = response.data.questionId
        console.log(`>> Next question received has questionId ` + questionId)
    }, (error) => {
        console.log(error);
    });

    // render the next question
    if(questionId != null) { // if quiz is not finished, render question (null is returned for questionId by CAT-Module if quiz has concluded)
        // load question JSON with given quizId
        const question = JSON.parse(fs.readFileSync(require.resolve(`../question-files/Q${questionId}.json`), 'utf8'))
        console.log(`>> JSON loaded with questionId ` + question.questionId)
        if(question.questionType === 'singleChoice'){ // check which question type .ejs to render
            // render question page
            res.render('singleChoiceQuestion', {question: question, quizId: quizId, ltik: res.locals.ltik})
        } // question type check can be replaced with switch case if multiple question types should be supported
    }else{ // quiz is finished
        let studentCompetency // proficiency of the examinee
        // retrieve student competency from CAT-Module
        await axios.get(`${createQuizUrl}/${quizId}/result`).then((response) => {
            studentCompetency = response.data.currentCompetency
            console.log(`>> Student competency received is ` + studentCompetency)
        }, (error) => {
            console.log(error);
        });
        // call /grade endpoint to post student competency as grade to LMS
        await axios.post(`${ownRootUrl}/grade?ltik=${res.locals.ltik}`, {
            "grade": studentCompetency
        }).then((response) => {
        }, (error) => {
            console.log(error);
        });
        // render page that quiz has been finished
        res.render('finished', {studentCompetency: Math.round(studentCompetency * 100) / 100})
    }
})

/**
 * Checks whether the submitted answer is correct for the given questionId and quizId.
 * Receives a request body containing the answer submitted to this endpoint by the generated form of the .ejs render of that questionType.
 * After the check, an automatic redirection back to /render/quizzes/:quizId?correct=? occurs, with the query parameter correct being 0 or 1
 * depending on whether the submitted answer was correct or not.
 */
router.post('/check-answer/quizzes/:quizId/questions/:questionId', async (req, res) => {

    let quizId = req.params.quizId
    let questionId = req.params.questionId

    console.log(`>> Receiving request at /check-answer/quizzes/${quizId}/questions/${questionId}`)
    console.log('>> quizId is ' + quizId)
    console.log('>> questionId is ' + questionId)

    // load question JSON with given quizId
    let question = JSON.parse(fs.readFileSync(require.resolve(`../question-files/Q${questionId}.json`), 'utf8'))
    let solution = question.solution // correct solution for that question
    let submittedAnswer = req.body.answer // answer submitted for that question
    console.log(">> Correct solution is = " + submittedAnswer)
    console.log(">> Submitted answer = " + submittedAnswer)

    let isCorrect = null

    // check which check-answer to use to evaluate answer
    if(question.questionType === 'singleChoice'){ // if question is a single choice question
        isCorrect = submittedAnswer === solution // check if submitted answer is correct
    } // question type check-answer can be replaced with switch case if multiple question types should be supported

    // redirect back to render question route
    console.log('>> Submitted answer was evaluated as ' + isCorrect)
    console.log(`>> Redirecting back to /render/quizzes/${quizId}?correct=${isCorrect}`)
    lti.redirect(res, `/render/quizzes/${quizId}/?correct=${+isCorrect}`)
    // isCorrect is converted to int representation (CAT-Module accepts either 0 or 1)
})

/**
 * Receives a score in the request body and submits it as a grade to the LMS grading system.
 * Grade is assigned to the examinee (in this case the student competency is the grade).
 */
router.post('/grade', async (req, res) => {
    console.log(`>> Receiving request at /grade`)
    try {
        let idToken = res.locals.token // the id token identifying the examinee
        let score = req.body.grade // the score used as the grade (in this case it is the student competency)
        console.log(`>> Score received is ` + score)
        let gradingObject = {
            userId: idToken.user,
            scoreGiven: score,
            scoreMaximum: 100,
            activityProgress: 'Completed',
            gradingProgress: 'FullyGraded'
        }

        // selecting linetItemId
        let lineItemId = idToken.platformContext.endpoint.lineitem
        if (!lineItemId) {
            let response = await lti.Grade.getLineItems(idToken, {resourceLinkId: true})
            let lineItems = response.lineItems
            if (lineItems.length === 0) {
                let newLineItem = {
                    scoreMaximum: 100,
                    label: 'Grade',
                    tag: 'grade',
                    resourceLinkId: idToken.platformContext.resource.id
                }
                let lineItem = await lti.Grade.createLineItem(idToken, newLineItem)
                lineItemId = lineItem.id
            } else lineItemId = lineItems[0].id
        }
        // submitting grade to LMS
        let responseGrade = await lti.Grade.submitScore(idToken, lineItemId, gradingObject)
        return res.send(responseGrade)
    } catch (err) {
        console.log(err.message)
    }
})

module.exports = router
