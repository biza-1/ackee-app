type Error = {
    [key: string]: any;
    status?: number;
}

const userNotAuthorized: string = 'User not authorized.'

export const authorizeAndReturnUserId = (req: any): string | undefined => {
  const authorization = req.param.authorization

  if (!authorization) {
    throwUserError(userNotAuthorized)
  }

  const auth = authorization.split(' ')
  if (auth.length === 2 && auth[0] === 'Basic') {
    const credentials = Buffer.from(auth[1], 'base64').toString('utf-8')
    const [username, password] = credentials.split(':')

    return username
  } else {
    throwUserError(userNotAuthorized)
  }
}

export const throwUserError = (message: string) => {
  const error: Error = new Error(message)
  error.status = 400
  throw error
}
