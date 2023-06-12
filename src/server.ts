import { createServer } from 'unicore'
import { ctrl } from './app/controllers'
import logger from './app/logger'
import * as problemService from './app/services/problemCrud/problemService'
import * as hello from './app/services/helloService'

const server = createServer()
server.use(logger.express)
server.use(ctrl.json)
server.use(ctrl.cors)
server.all('/', ctrl.httpRootHandler)
server.use(ctrl.healthz)

server.all('/hello', ctrl.service(hello.hello))
server.post('/problem/createEntity', ctrl.service(problemService.createEntity))
server.post('/problem/createEntity', ctrl.service(problemService.createEntity))
server.put('/problem/:id', ctrl.service(problemService.updateEntity))
server.get('/problem/:id', ctrl.service(problemService.getEntity))
server.delete('/problem/:id', ctrl.service(problemService.deleteEntity))
server.post('/problem/list', ctrl.service(problemService.listData));
server.post('/problem/answer', ctrl.service(problemService.answerProblem))



server.use(ctrl.httpErrorHandler)
server.use(ctrl.httpFinalHandler)

export default server
