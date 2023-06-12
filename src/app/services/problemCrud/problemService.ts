const util = require('util')
import db from '../../db/riddlesDb'

// db operations changed to promises
const dbGet = util.promisify(db.get).bind(db)
const dbRun = util.promisify(db.run).bind(db)
const dbAll = util.promisify(db.all).bind(db)

import * as authorizationService from '../authorizationService'

import problemConstants from '../../constants/problemConstants'

import configSchema from '../../../config'

export const createEntity = async (req: any) => {
  const userId:
    | string
    | undefined = authorizationService.authorizeAndReturnUserId(req)

  const requestBody: { type: string; question: string } = req.requestBody
  // all validations
  validateInput(requestBody)
  // separate because it is only used in create
  await checkIfProblemExists(requestBody)

  await dbRun(
    'INSERT INTO problems (type, authorId, question) VALUES (?, ?, ?)',
    [requestBody.type, userId, requestBody.question]
  )

  return await dbGet('SELECT * FROM problems WHERE id = last_insert_rowid()')
}

export const updateEntity = async (req: any) => {
  const userId:
    | string
    | undefined = authorizationService.authorizeAndReturnUserId(req)

  const problemId = req.param.id

  const requestBody: { type: string; question: string } = req.requestBody
  // all validations
  validateInput(requestBody)

  // not checking before, because that would mean more calls, instead just called and checked when returning
  await dbRun(
    'UPDATE problems SET type = ?, question = ? WHERE id = ? AND authorId = ?',
    [requestBody.type, requestBody.question, problemId, userId]
  )

  return findAndCheckProblemForCurrentUser(problemId, userId)
}

export const getEntity = async (req: any) => {
  const userId:
    | string
    | undefined = authorizationService.authorizeAndReturnUserId(req)

  const problemId = req.param.id

  return (
    (await dbGet(
      'SELECT p.*, CASE WHEN ua.problemId IS NOT NULL THEN 1 ELSE 0 END AS answered FROM problems AS p LEFT JOIN userAnswered AS ua ON p.id = ua.problemId AND ua.userId = ? WHERE p.id = ?;',
      [userId, problemId]
    )) || {}
  )
}

export const deleteEntity = async (req: any) => {
  const userId:
    | string
    | undefined = authorizationService.authorizeAndReturnUserId(req)

  const problemId = req.param.id

  await findAndCheckProblemForCurrentUser(problemId, userId)

  return (
    (await dbGet('DELETE FROM problems WHERE id = ? AND authorId = ?', [
      problemId,
      userId,
    ])) || {}
  )
}

export const listData = async (req: any) => {
  const userId:
    | string
    | undefined = authorizationService.authorizeAndReturnUserId(req)

  const requestBody: { type: string; answered: boolean } = req.requestBody
  // prepares query for conditions
  const { sql, sqlFilter } = generateListSQLQuery(requestBody.answered, requestBody.type, [userId])

  return dbAll(sql, sqlFilter)
}

const generateListSQLQuery = (answered: boolean, type: string, sqlFilter: [any]) => {
  let sql = `
    SELECT p.*, CASE WHEN ua.problemId IS NOT NULL THEN 1 ELSE 0 END AS answered
    FROM problems AS p
    LEFT JOIN userAnswered AS ua ON p.id = ua.problemId AND ua.userId = ?`

  const filters = []

  if (answered !== undefined) {
    filters.push(`answered = ?`)
    sqlFilter.push(answered)
  }

  if (type) {
    filters.push(`p.type = ?`)
    sqlFilter.push(type)
  }

  if (filters.length > 0) {
    sql += ` WHERE ${filters.join(' AND ')}`
  }

  return { sql, sqlFilter }
}

export const answerProblem = async (req: any) => {
  const userId:
    | string
    | undefined = authorizationService.authorizeAndReturnUserId(req)

  const requestBody: { id: number; answer: string } = req.requestBody

  // check if user already answered problem
  const userAlreadyAnswered = await checkIfAnswerExists(requestBody.id, userId)

  // loading problem for checking answers
  const problem:
    | {
        type: string
        question: string
        authorId: string
      }
    | undefined = await findAndCheckProblemForCurrentUser(
    requestBody.id,
    userId
  )

  // validating expression based on calculated anwer and
  // riddle base on static answer
  // when answer is correct it is added into table userAnswered
  if (problem?.type === problemConstants.Types.EXPRESSION) {
    const correctAnswer = evaluateExpression(problem?.question)

    if (correctAnswer === Number(requestBody.answer)) {
      return resolveCorrectAnswer(requestBody.id, userId, userAlreadyAnswered)
    } else {
      return resolveIncorrectAnswer(userAlreadyAnswered)
    }
  } else {
    if (requestBody.answer === configSchema.problemService.riddleAnswer) {
      return resolveCorrectAnswer(requestBody.id, userId, userAlreadyAnswered)
    } else {
      return resolveIncorrectAnswer(userAlreadyAnswered)
    }
  }
}

const resolveCorrectAnswer = async (
  id: number,
  userId: string | undefined,
  userAlreadyAnswered: boolean
) => {
  // incase user already answered so that there is not too much data in usere answered
  if (userAlreadyAnswered)
    return Promise.resolve({
      Result: 'Already answered. Current asnwer is correct.',
    })
  await dbRun('INSERT INTO userAnswered ( problemId, userId) VALUES (?, ?)', [
    id,
    userId,
  ])
  return Promise.resolve({ Result: 'Correct answer.' })
}

const resolveIncorrectAnswer = async (userAlreadyAnswered: boolean) => {
  // in case user answered we inform him that his current answer is incorrect
  if (userAlreadyAnswered)
    return Promise.resolve({
      Result: 'Already correctly answered. Current answer incorrect.',
    })
  return Promise.resolve({ Result: 'Answer incorrect. Try again.' })
}

const validateInput = (requestBody: any) => {
  // included check
  if (
    !requestBody ||
    !requestBody.type ||
    !requestBody.question ||
    requestBody.question.length < 1
  ) {
    authorizationService.throwUserError(
      `Type and question must be entered and not empty.`
    )
  }

  // validate type of question
  const problemTypesList = [
    problemConstants.Types.EXPRESSION,
    problemConstants.Types.RIDDLE,
  ]
  if (!problemTypesList.includes(requestBody.type)) {
    authorizationService.throwUserError(
      `Invalid problem type - the only allowed ones are: [${problemTypesList}].`
    )
  }

  // validates that expression is valid
  if (requestBody.type === problemConstants.Types.EXPRESSION) {
    evaluateExpression(requestBody.question)
  }
}

const checkIfProblemExists = async (requestBody: any) => {
  // check if problem exist to determine UPDATE or INSERT
  const problemExists: boolean = await checkIfQuestionExists(
    requestBody.question,
    requestBody.type
  )

  if (problemExists) {
    authorizationService.throwUserError(
      `Question already exists - ${requestBody.question}.`
    )
  }
}

const evaluateExpression = (expression: string): number | undefined => {
  try {
    const result = eval(expression)
    return result
  } catch (e) {
    authorizationService.throwUserError('Expression not valid!')
    // TODO log the error
  }
}

const checkIfQuestionExists = async (
  question: string,
  type: string
): Promise<boolean> => {
  const {
    count,
  }: {
    count: number
  } = await dbGet(
    'SELECT COUNT(*) AS count FROM problems WHERE question = ? and type = ?',
    [question, type]
  )

  if (count > 0) return true
  else return false
}

const checkIfAnswerExists = async (
  id: number,
  userId: string | undefined
): Promise<boolean> => {
  const {
    count,
  }: {
    count: number
  } = await dbGet(
    'SELECT COUNT(*) AS count FROM userAnswered WHERE problemId = ? and userId = ?',
    [id, userId]
  )

  if (count > 0) return true
  else return false
}

const findAndCheckProblemForCurrentUser = async (
  problemId: number,
  userId: string | undefined
) => {
  const problem: {
    type: string
    question: string
    authorId: string
  } = await dbGet('SELECT * FROM problems WHERE id = ?', [problemId])

  if (!problem || (userId && problem.authorId !== userId)) {
    authorizationService.throwUserError('Problem not found for current user.')
  } else {
    return problem
  }
}
