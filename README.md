# CAT-Middleware

A middleware prototype for integrating computerized adaptive testing (CAT) into learning management 
systems (LMS) in a standardized way via the Learning Tools Interoperability Standard (LTI). 
This project makes use of the Ltijs library and middleware functionalities run on the Express
server provided by Ltijs.

## Prerequisites

A package manager like `npm` is recommended to install and start the CAT-Middleware.

## Setup

To install the required packages, use:
```
npm install
```

Additionally, Ltijs requires a database and natively supports `MongoDB`.
Therefore a `MongoDB` instance is required.  A simple and quick way to set up `MongoDB` is by using
the [official mongo docker image](https://hub.docker.com/_/mongo).
The database credentials [can be configured in an `.env` file](##database-configuration-(required)).


## Configuration

### LMS Registration (required)

In order to use the CAT-Middleware in a LMS, the LMS must first be registered in the CAT-Middleware.
The registration details are provided by the LMS.
Registering the LMS can be done in the `lms-config.json`, 
which will be used to register the LMS when the CAT-Middleware starts up.


### Database configuration (required)
The database credentials are to be specified in the `.env` file, which needs to be created first.
For creating the `.env`, use the `example.env` as a template.

### Quiz configuration (optional)

It is possible to change the quiz configuration sent to the CAT-Module in the `quiz-config.json`.
This configuration will be sent to the CAT-Module to create a quiz when `/start-quiz` is called.

### Changing or adding question contents (optional)

A question's contents are stored in `/question-files` as `.json` files and the values can simply be edited.
The CAT-Middleware only detects questions with the following naming convention: `Q<questionId>.json`.
E.g. The question's contents for questionId 242 are stored in the `Q242.json`.


## Usage
After everything has been setup and configured, to run the CAT-Middleware use:
```
npm start
```
The CAT-Middleware is now listening on `localhost:3000`.

## API
| Method | Endpoint                                            | Description                                                                                                                                      |
|--------|-----------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|
| GET    | /start-quiz                                         | Starts the quiz with the quiz configuration loaded from the `quiz-config.json`. Automatically called when LTI connection has been established.   |                                                                                                      | 
| GET    | /render/quizzes/:quizId                             | Renders the current question for the quiz with given `quizId`.                                                                                     |
| GET    | /check-answer/quizzes/:quizId/questions/:questionId | Checks whether the answer for the quiz and question with given `quizId` and `questionId` is correct and redirects back to `/render/quizzes/:quizId`. |
| POST   | /grade                                              | Submits the grade/score posted to this endpoint to the LMS .                                                                                     |


Ltijs reserves additional endpoints required for registering the tool in the LMS:

* Route for handling the initial Login Request coming from the LMS: `/login`
* Route serving the JWK keyset: `/keys`
