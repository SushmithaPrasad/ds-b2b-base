// const log4js = require('log4js');
const _ = require('lodash');
const { v4: uuid } = require('uuid');
const config = require('../config');

// const logger = log4js.getLogger(global.loggerName);

let visitedNodes = [];
let visitedValidation = [];

function tab(len) {
	let d = '';
	while (len > 0) {
		d += '    ';
		len--;
	}
	return d;
}

/**
 * 
 * @param {any} dataJson 
 */
function parseFlow(dataJson) {
	visitedNodes = [];
	const inputNode = dataJson.inputNode;
	const nodes = dataJson.nodes;
	let api = '/' + dataJson.app + inputNode.options.path;
	let code = [];
	code.push('const fs = require(\'fs\');');
	code.push('const path = require(\'path\');');
	code.push('const express = require(\'express\');');
	code.push('const router = express.Router({ mergeParams: true });');
	code.push('const log4js = require(\'log4js\');');
	code.push('const fileUpload = require(\'express-fileupload\');');
	code.push('const { XMLBuilder, J2XParser, parse, XMLParser } = require(\'fast-xml-parser\');');
	code.push('const fastcsv = require(\'fast-csv\');');
	code.push('const XLSX = require(\'xlsx\');');
	code.push('const { v4: uuid } = require(\'uuid\');');
	code.push('const _ = require(\'lodash\');');
	code.push('');
	code.push('const stateUtils = require(\'./state.utils\');');
	code.push('const nodeUtils = require(\'./node.utils\');');
	code.push('const fileUtils = require(\'./file.utils\');');
	code.push('');
	code.push('const logger = log4js.getLogger(global.loggerName);');
	code.push('const xmlBuilder = new XMLBuilder();');
	code.push('const xmlParser = new XMLParser();');
	code.push('');
	// TODO: Method to be fixed.
	// code.push(`router.${(inputNode.options.method || 'POST').toLowerCase()}('${api}', async function (req, res) {`);

	if (inputNode.options && inputNode.options.contentType === 'multipart/form-data') {
		code.push(`${tab(0)}router.use(fileUpload({`);
		code.push(`${tab(1)}useTempFiles: true,`);
		code.push(`${tab(1)}tempFileDir: './uploads'`);
		code.push(`${tab(0)}}));`);
	} else if (inputNode.options && inputNode.options.contentType === 'application/json') {
		code.push(`${tab(0)}router.use(express.json({ inflate: true, limit: '100mb' }));`);
	} else if (inputNode.options && inputNode.options.contentType === 'application/xml') {
		code.push(`${tab(0)}router.use(express.raw({ type: ['application/xml'] }));`);
		code.push(`${tab(0)}router.use((req, res, next) => {`);
		code.push(`${tab(1)}if (req.get('content-type') === 'application/xml') {`);
		code.push(`${tab(2)}req.body = xmlParser.parse(req.body);`);
		code.push(`${tab(1)}}`);
		code.push(`${tab(1)}next();`);
		code.push(`${tab(0)}});`);
	} else {
		code.push(`${tab(0)}router.use(express.raw());`);
	}

	code.push(`router.post('${api}', async function (req, res) {`);
	code.push(`${tab(1)}let txnId = req.headers['data-stack-txn-id'];`);
	code.push(`${tab(1)}let remoteTxnId = req.headers['data-stack-remote-txn-id'];`);
	code.push(`${tab(1)}let response = req;`);
	code.push(`${tab(1)}let state = stateUtils.getState(response, '${inputNode._id}', false, '${(inputNode.options.contentType || '')}');`);
	code.push(`${tab(1)}let node = {};`);
	code.push(`${tab(1)}node['${inputNode._id}'] = state;`);
	code.push(`${tab(1)}let isResponseSent = false;`);
	if (inputNode.type === 'API') {
		code.push(`${tab(1)}setTimeout(function() {`);
		code.push(`${tab(2)}if (!isResponseSent) {`);
		code.push(`${tab(3)}res.status(202).json({ message: 'Your requested process is taking more then expected time, Please check interactions for final status.' });`);
		code.push(`${tab(3)}isResponseSent = true;`);
		code.push(`${tab(2)}}`);
		code.push(`${tab(1)}}, 30000);`);
	}
	if (inputNode.options && inputNode.options.contentType === 'multipart/form-data') {
		if (inputNode.type === 'FILE') {
			code.push(`${tab(2)}res.status(202).json({ message: 'File is being processed' });`);
		}
		code.push(`${tab(1)}if (!req.files || Object.keys(req.files).length === 0) {`);
		code.push(`${tab(2)}state.status = "ERROR";`);
		code.push(`${tab(2)}state.statusCode = 400;`);
		code.push(`${tab(2)}state.body = { message: 'No files were uploaded' };`);
		code.push(`${tab(2)}stateUtils.upsertState(req, state);`);
		code.push(`${tab(2)}return;`);
		code.push(`${tab(1)}}`);
		code.push(`${tab(1)}const reqFile = req.files.file;`);
		code.push(`${tab(1)}stateUtils.updateInteraction(req, { payloadMetaData: reqFile });`);
		code.push(`${tab(1)}logger.debug(\`[\${req.header('data-stack-txn-id')}] [\${req.header('data-stack-remote-txn-id')}] Request file info - \`, reqFile);`);
		const dataFormat = dataJson.dataStructures[inputNode.dataStructure.outgoing._id] || {};
		if (!dataFormat.formatType) {
			dataFormat.formatType = 'JSON';
		}
		if (dataFormat.formatType == 'EXCEL') {
			code.push(`${tab(1)}const workBook = XLSX.readFile(reqFile.tempFilePath);`);
			code.push(`${tab(1)}XLSX.writeFile(workBook, reqFile.tempFilePath, { bookType: "csv" });`);
		}

		if (dataFormat.formatType === 'CSV' || dataFormat.formatType == 'EXCEL') {
			code.push(`${tab(1)}logger.debug('Parsing request file to ${inputNode.options.contentType}');`);
			let rowDelimiter = '';
			if (dataFormat.lineSeparator === '\\\\n') {
				rowDelimiter = '\\n';
			} else if (dataFormat.lineSeparator === '\\\\r\\\\n') {
				rowDelimiter = '\\r\\n';
			} else if (dataFormat.lineSeparator === '\\\\r') {
				rowDelimiter = '\\r';
			} else {
				rowDelimiter = '\\n';
			}
			code.push(`${tab(1)}const pr = await new Promise((resolve, reject) => {`);
			code.push(`${tab(2)}let records = [];`);
			code.push(`${tab(2)}const fileStream = fs.createReadStream(reqFile.tempFilePath);`);
			code.push(`${tab(2)}fastcsv.parseStream(fileStream, {`);
			code.push(`${tab(3)}headers: true,`);
			code.push(`${tab(3)}skipLines: 0,`);
			code.push(`${tab(3)}rowDelimiter: '${rowDelimiter}',`);
			code.push(`${tab(3)}delimiter: '${dataFormat.character}',`);
			if (dataFormat.strictValidation) {
				code.push(`${tab(3)}strictColumnHandling: true,`);
			} else {
				code.push(`${tab(3)}discardUnmappedColumns: true,`);
			}
			code.push(`${tab(2)}}).transform(row => {`);
			code.push(`${tab(3)}let temp = fileUtils.convertData${dataFormat._id}(row);`);
			code.push(`${tab(3)}return temp;`);
			code.push(`${tab(2)}}).on('error', err => {`);
			code.push(`${tab(3)}state.status = "ERROR";`);
			code.push(`${tab(3)}state.statusCode = 400;`);
			code.push(`${tab(3)}state.body = err;`);
			code.push(`${tab(3)}stateUtils.upsertState(req, state);`);
			code.push(`${tab(3)}reject(err);`);
			code.push(`${tab(2)}}).on('data', row => records.push(row))`);
			code.push(`${tab(2)}.on('end', rowCount => {`);
			code.push(`${tab(3)}logger.debug('Parsed rows = ', rowCount);`);
			code.push(`${tab(3)}state.totalRecords = rowCount;`);
			code.push(`${tab(3)}state.statusCode = 200;`);
			code.push(`${tab(3)}state.body = records;`);
			// code.push(`${tab(3)}logger.trace('Parsed Data - ', state.body);`);
			code.push(`${tab(3)}resolve(records);`);
			code.push(`${tab(2)}});`);
			code.push(`${tab(1)}});`);
			code.push(`${tab(1)} `);
		} else if (dataFormat.formatType === 'JSON') {
			code.push(`${tab(2)}const contents = fs.readFileSync(reqFile.tempFilePath, 'utf-8');`);
			code.push(`${tab(2)}state.status = "SUCCESS";`);
			code.push(`${tab(2)}state.statusCode = 200;`);
			code.push(`${tab(2)}state.body = JSON.parse(contents);`);
		} else if (dataFormat.formatType === 'XML') {
			code.push(`${tab(2)}const contents = fs.readFileSync(reqFile.tempFilePath, 'utf-8');`);
			code.push(`${tab(2)}state.status = "SUCCESS";`);
			code.push(`${tab(2)}state.statusCode = 200;`);
			code.push(`${tab(2)}state.body = xmlParser.parse(contents);`);
		} else if (dataFormat.formatType === 'BINARY') {
			// code.push(`${tab(2)}fs.copyFileSync(reqFile.tempFilePath, path.join(process.cwd(), 'downloads', req['local']['output-file-name']));`);
			// code.push(`${tab(2)}}`);
			// code.push(`${tab(2)}}`);
		}
	} else if (inputNode.options && inputNode.options.contentType === 'application/json') {
		code.push(`${tab(1)}const metaData = {};`);
		code.push(`${tab(1)}if (Array.isArray(state.body)) {`);
		code.push(`${tab(2)}metaData.type = 'Array';`);
		code.push(`${tab(2)}metaData.attributeCount = state.body && state.body[0] ? Object.keys(state.body[0]).length : 0;`);
		code.push(`${tab(2)}metaData.totalRecords = state.body ? state.body.length : 0;`);
		code.push(`${tab(1)}} else {`);
		code.push(`${tab(2)}metaData.type = 'Object';`);
		code.push(`${tab(2)}metaData.attributeCount = state.body ? Object.keys(state.body).length : 0;`);
		code.push(`${tab(2)}metaData.totalRecords = 1;`);
		code.push(`${tab(1)}}`);
		code.push(`${tab(1)}stateUtils.updateInteraction(req, { payloadMetaData: metaData });`);
	} else if (inputNode.options && inputNode.options.contentType === 'application/xml') {
		code.push(`${tab(1)}const metaData = {};`);
		code.push(`${tab(1)}if (Array.isArray(state.body)) {`);
		code.push(`${tab(2)}metaData.type = 'Array';`);
		code.push(`${tab(2)}metaData.attributeCount = state.body && state.body[0] ? Object.keys(state.body[0]).length : 0;`);
		code.push(`${tab(2)}metaData.totalRecords = state.body ? state.body.length : 0;`);
		code.push(`${tab(1)}} else {`);
		code.push(`${tab(2)}metaData.type = 'Object';`);
		code.push(`${tab(2)}metaData.attributeCount = state.body ? Object.keys(state.body).length : 0;`);
		code.push(`${tab(2)}metaData.totalRecords = 1;`);
		code.push(`${tab(1)}}`);
		code.push(`${tab(1)}stateUtils.updateInteraction(req, { payloadMetaData: metaData });`);
	}
	// code.push(`${tab(2)}response = { statusCode: 200, body: state.body, headers: state.headers };`);
	code.push(`${tab(1)}state.statusCode = 200;`);
	code.push(`${tab(1)}state.status = 'SUCCESS';`);
	code.push(`${tab(1)}response = _.cloneDeep(state);`);
	code.push(`${tab(1)}stateUtils.upsertState(req, state);`);
	// code.push(`${tab(1)}logger.trace(\`[\${txnId}] [\${remoteTxnId}] Input node Request Body - \`, JSON.stringify(state.body));`);
	code.push(`${tab(1)}logger.debug(\`[\${txnId}] [\${remoteTxnId}] Input node Request Headers - \`, JSON.stringify(state.headers));`);
	let tempNodes = (inputNode.onSuccess || []);
	for (let index = 0; index < tempNodes.length; index++) {
		const ss = tempNodes[index];
		const node = nodes.find(e => e._id === ss._id);
		if (ss.condition) {
			node.condition = ss.condition.replaceAll('{{', '').replaceAll('}}', '');
		}
		if (visitedNodes.indexOf(node._id) > -1) {
			return;
		}
		visitedNodes.push(node._id);
		if (node.condition) code.push(`${tab(1)}if (${node.condition}) {`);
		code = code.concat(generateCode(node, nodes));
		if (node.condition) code.push(`${tab(1)}}`);
	}
	if (!tempNodes || tempNodes.length == 0) {
		code.push(`${tab(1)}stateUtils.updateInteraction(req, { status: 'SUCCESS' });`);
	}
	// (inputNode.onSuccess || []).map(ss => {
	// 	const nodeCondition = ss.condition;
	// 	const temp = nodes.find(e => e._id === ss._id);
	// 	temp.condition = nodeCondition;
	// 	return temp;
	// }).forEach((node, i) => {
	// 	if (visitedNodes.indexOf(node._id) > -1) {
	// 		return;
	// 	}
	// 	visitedNodes.push(node._id);
	// 	if (node.condition) code.push(`${tab(1)}if (${node.condition}) {`);
	// 	code = code.concat(generateCode(node, nodes));
	// 	if (node.condition) code.push(`${tab(1)}}`);
	// });
	code.push(`${tab(1)}if (!isResponseSent) {`);
	code.push(`${tab(2)}res.status((response.statusCode || 200)).json(response.body);`);
	code.push(`${tab(2)}isResponseSent = true;`);
	code.push(`${tab(1)}}`);
	code.push('});');
	code.push('module.exports = router;');
	return code.join('\n');
}

/**
 * 
 * @param {any} dataJson 
 */
function generateCode(node, nodes) {
	let code = [];
	code.push(`${tab(1)}\n\n// ═══════════════════ ${node._id} / ${node.name} / ${node.type} ══════════════════════`);
	code.push(`${tab(1)}logger.debug(\`[\${txnId}] [\${remoteTxnId}] Invoking node :: ${node._id} / ${node.name} / ${node.type}\`)`);
	code.push(`${tab(1)}try {`);
	if (node.type === 'RESPONSE') {
		code.push(`${tab(2)}state = stateUtils.getState(response, '${node._id}', false, '${(node.options.contentType || '')}');`);
		if (node.options && node.options.statusCode) {
			code.push(`${tab(2)}state.statusCode = ${node.options.statusCode};`);
		}
		if (node.options && node.options.body) {
			code.push(`${tab(2)}state.body = JSON.parse(\`${parseBody(node.options.body)}\`);`);
		}
		code.push(`${tab(2)}stateUtils.upsertState(req, state);`);
		code.push(`${tab(2)}state.status = 'SUCCESS';`);
		code.push(`${tab(2)}state.statusCode = 200;`);
		code.push(`${tab(2)}if (!isResponseSent) {`);
		code.push(`${tab(2)}isResponseSent = true;`);
		if (node.options.responseType == 'xml') {
			code.push(`${tab(2)}const state.xmlContent = xmlBuilder.build(state.body);`);
			code.push(`${tab(2)}res.set('Content-Type','application/xml');`);
			code.push(`${tab(2)}res.status(state.statusCode).write(state.xmlContent).end();`);
		} else {
			code.push(`${tab(2)}res.status(state.statusCode).json(state.body);`);
			code.push(`${tab(2)}node['${node._id}'] = state;`);
			code.push(`${tab(2)}stateUtils.upsertState(req, state);`);
		}
		code.push(`${tab(2)}}`);
	} else {
		code.push(`${tab(2)}state = stateUtils.getState(response, '${node._id}', false, '${(node.options.contentType || '')}');`);
		code.push(`${tab(2)}response = await nodeUtils.${_.camelCase(node._id)}(req, state, node);`);
		code.push(`${tab(2)}if (response.statusCode >= 400) {`);
		if (node.onError && node.onError.length > 0) {
			code.push(`${tab(3)}state = stateUtils.getState(response, '${node.onError[0]._id}');`);
			code.push(`${tab(3)}await nodeUtils.${_.camelCase(node.onError[0]._id)}(req, state, node);`);
		} else {
			code.push(`${tab(3)}if (!isResponseSent) {`);
			code.push(`${tab(4)}res.status((response.statusCode || 200)).json(response.body);`);
			code.push(`${tab(4)}isResponseSent = true;`);
			code.push(`${tab(3)}}`);
		}
		code.push(`${tab(2)}}`);
	}
	if (!node.onSuccess || node.onSuccess.length == 0) {
		code.push(`${tab(2)}stateUtils.updateInteraction(req, { status: 'SUCCESS' });`);
	}
	code.push(`${tab(1)}} catch (err) {`);
	code.push(`${tab(2)}logger.error(err);`);
	code.push(`${tab(2)}if (!isResponseSent) {`);
	code.push(`${tab(3)}res.status(500).json({ message: err.message });`);
	code.push(`${tab(3)}isResponseSent = true;`);
	code.push(`${tab(2)}}`);
	code.push(`${tab(1)}}`);
	let tempNodes = (node.onSuccess || []);
	for (let index = 0; index < tempNodes.length; index++) {
		const ss = tempNodes[index];
		const nextNode = nodes.find(e => e._id === ss._id);
		if (ss.condition) {
			nextNode.condition = ss.condition.replaceAll('{{', '').replaceAll('}}', '');
		}
		if (visitedNodes.indexOf(nextNode._id) > -1) {
			return;
		}
		visitedNodes.push(nextNode._id);
		if (nextNode.condition) code.push(`${tab(1)}if (${nextNode.condition}) {`);
		code = code.concat(generateCode(nextNode, nodes));
		if (nextNode.condition) code.push(`${tab(1)}}`);
	}
	// (node.onSuccess || []).map(ss => {
	// 	const nodeCondition = ss.condition;
	// 	const temp = nodes.find(e => e._id === ss._id);
	// 	temp.condition = nodeCondition;
	// 	return temp;
	// }).forEach((node, i) => {
	// 	if (visitedNodes.indexOf(node._id) > -1) {
	// 		return;
	// 	}
	// 	visitedNodes.push(node._id);
	// 	if (node.condition) code.push(`${tab(1)}if (${node.condition}) {`);
	// 	code = code.concat(generateCode(node, nodes));
	// 	if (node.condition) code.push(`${tab(1)}}`);
	// });
	return code;
}

function parseNodes(dataJson) {
	visitedNodes = [];
	const code = [];
	code.push('const log4js = require(\'log4js\');');
	code.push('const _ = require(\'lodash\');');
	code.push('const httpClient = require(\'./http-client\');');
	code.push('const commonUtils = require(\'./common.utils\');');
	code.push('const stateUtils = require(\'./state.utils\');');
	code.push('const validationUtils = require(\'./validation.utils\');');
	code.push('const { v4: uuid } = require(\'uuid\');');
	code.push('');
	code.push('const logger = log4js.getLogger(global.loggerName);');
	code.push('');
	return _.concat(code, generateNodes(dataJson)).join('\n');
}


function generateNodes(node) {
	const nodes = node.nodes;
	let code = [];
	const exportsCode = [];
	let loopCode = [];
	nodes.forEach((node) => {
		if (node.options) {
			if (node.options.update == undefined || node.options.update == null) {
				node.options.update = true;
			}
			if (node.options.insert == undefined || node.options.insert == null) {
				node.options.insert = true;
			}
		}
		exportsCode.push(`module.exports.${_.camelCase(node._id)} = ${_.camelCase(node._id)};`);
		code.push(`async function ${_.camelCase(node._id)}(req, state, node) {`);
		code.push(`${tab(1)}logger.info(\`[\${req.header('data-stack-txn-id')}] [\${req.header('data-stack-remote-txn-id')}] Starting ${_.camelCase(node._id)} Node\`);`);
		code.push(`${tab(1)}try {`);
		let functionName = 'validate_structure_' + _.camelCase(node._id);
		if (node.type === 'API' || node.type === 'DATASERVICE' || node.type === 'FUNCTION' || node.type === 'FLOW' || node.type === 'AUTH-DATASTACK') {
			code.push(`${tab(2)}const options = {};`);
			code.push(`${tab(2)}let customHeaders = { 'content-type': 'application/json' };`);
			code.push(`${tab(2)}if (req.header('authorization')) {`);
			code.push(`${tab(3)}customHeaders['authorization'] = req.header('authorization');`);
			code.push(`${tab(2)}}`);
			code.push(`${tab(2)}let customBody = state.body;`);
			if (node.type === 'API' && node.options) {
				code.push(`${tab(2)}state.url = \`${parseDynamicVariable(node.options.url)}\`;`);
				code.push(`${tab(2)}state.method = '${node.options.method || 'POST'}';`);
				code.push(`${tab(2)}options.url = state.url;`);
				code.push(`${tab(2)}options.method = state.method;`);
				if (node.options.headers && !_.isEmpty(node.options.headers)) {
					code.push(`${tab(2)}customHeaders = JSON.parse(\`${parseHeaders(node.options.headers)}\`);`);
				}
				if (node.options.body && !_.isEmpty(node.options.body)) {
					code.push(`${tab(2)}customBody = JSON.parse(\`${parseBody(node.options.body)}\`);`);
				}
			} else if (node.type === 'DATASERVICE' && node.options.dataService && node.options.dataService._id) {
				code.push(`${tab(2)}const dataService = await commonUtils.getDataService('${node.options.dataService._id}');`);
				if (config.isK8sEnv()) {
					code.push(`${tab(2)}state.url = 'http://' + dataService.collectionName.toLowerCase() + '.' + '${config.DATA_STACK_NAMESPACE}' + '-' + dataService.app.toLowerCase() + '/' + dataService.app + dataService.api + '/utils/bulkUpsert?update=${node.options.update}&insert=${node.options.insert}'`);
				} else {
					code.push(`${tab(2)}state.url = 'http://localhost:' + dataService.port + '/' + dataService.app + dataService.api + '/utils/bulkUpsert?update=${node.options.update}&insert=${node.options.insert}'`);
				}
				code.push(`${tab(2)}state.method = 'POST';`);
				code.push(`${tab(2)}options.url = state.url;`);
				code.push(`${tab(2)}options.method = state.method;`);
				if (node.options.headers && !_.isEmpty(node.options.headers)) {
					code.push(`${tab(2)}customHeaders = JSON.parse(\`${parseHeaders(node.options.headers)}\`);`);
				}

				code.push(`${tab(2)}let iterator = [];`);
				code.push(`${tab(2)}if (!Array.isArray(state.body)) {`);
				code.push(`${tab(3)}iterator = _.chunk([state.body], 500);`);
				code.push(`${tab(2)}} else {`);
				code.push(`${tab(3)}iterator = _.chunk(state.body, 500);`);
				code.push(`${tab(2)}}`);
				code.push(`${tab(2)}let batchList = iterator.map((e,i) => {`);
				code.push(`${tab(3)}return {_id: uuid(), seqNo: (i + 1), rows: e, status: 'PENDING' };`);
				code.push(`${tab(2)}});`);
				code.push(`${tab(2)}state.batchList = batchList;`);
				// code.push(`${tab(2)}delete state.body;`);
				// if (node.options.body && !_.isEmpty(node.options.body)) {
				// 	code.push(`${tab(2)}customBody = JSON.parse(\`${parseBody(node.options.body)}\`);`);
				// }
				// code.push(`${tab(2)}customBody = { docs: state.body };`);
			} else if (node.type === 'FUNCTION') {
				code.push(`${tab(2)}const faas = await commonUtils.getFaaS('${node.options.faas._id}');`);
				code.push(`${tab(2)}logger.trace({ faas });`);
				// code.push(`${tab(2)}state.url = \`${config.baseUrlGW}\${faas.url}\`;`);
				code.push(`${tab(2)}state.url = \`http://\${faas.deploymentName}.\${faas.namespace}\${faas.url.split('/a/').join('/')}\`;`);
				code.push(`${tab(2)}state.method = '${node.options.method || 'POST'}';`);
				code.push(`${tab(2)}logger.debug({ url: state.url });`);
				code.push(`${tab(2)}options.url = state.url;`);
				code.push(`${tab(2)}options.method = state.method;`);
				if (node.options.headers && !_.isEmpty(node.options.headers)) {
					code.push(`${tab(2)}customHeaders = JSON.parse(\`${parseHeaders(node.options.headers)}\`);`);
				}
				if (node.options.body && !_.isEmpty(node.options.body)) {
					code.push(`${tab(2)}customBody = JSON.parse(\`${parseBody(node.options.body)}\`);`);
				}
			} else if (node.type === 'FLOW') {
				code.push(`${tab(2)}const flow = await commonUtils.getFlow('${node.options._id}');`);
				code.push(`${tab(2)}logger.trace({ flow });`);
				code.push(`${tab(2)}state.url = \`${config.baseUrlBM}/b2b/pipes/\${flow.app}/\${flow.inputNode.options.path}\`;`);
				code.push(`${tab(2)}state.method = \`\${flow.inputNode.options.method || 'POST'}\`;`);
				code.push(`${tab(2)}options.url = state.url;`);
				code.push(`${tab(2)}options.method = state.method;`);
				if (node.options.headers && !_.isEmpty(node.options.headers)) {
					code.push(`${tab(2)}customHeaders = JSON.parse(\`${parseHeaders(node.options.headers)}\`);`);
				}
				if (node.options.body && !_.isEmpty(node.options.body)) {
					code.push(`${tab(2)}customBody = JSON.parse(\`${parseBody(node.options.body)}\`);`);
				}
			} else if (node.type === 'AUTH-DATASTACK') {
				code.push(`${tab(2)}const password = '${node.options.password}'`);
				code.push(`${tab(2)}state.url = '${config.baseUrlUSR}/auth/login'`);
				code.push(`${tab(2)}state.method = 'POST';`);
				code.push(`${tab(2)}options.url = state.url;`);
				code.push(`${tab(2)}options.method = state.method;`);
				code.push(`${tab(2)}customHeaders = state.headers;`);
				code.push(`${tab(2)}customBody = { username: '${node.options.username}', password: '${node.options.password}' };`);
			}
			code.push(`${tab(2)}options.headers = _.merge(state.headers, customHeaders);`);
			code.push(`${tab(2)}delete options.headers['cookie'];`);
			code.push(`${tab(2)}delete options.headers['host'];`);
			code.push(`${tab(2)}delete options.headers['connection'];`);
			code.push(`${tab(2)}delete options.headers['user-agent'];`);
			code.push(`${tab(2)}delete options.headers['content-length'];`);



			if (node.type === 'DATASERVICE') {
				code.push(`${tab(2)}let results = [];`);
				code.push(`${tab(2)}await state.batchList.reduce(async (prev, curr) => {`);
				code.push(`${tab(3)}await prev;`);
				code.push(`${tab(3)}if (!curr) { return; };`);
				code.push(`${tab(3)}if (options.method == 'POST' || options.method == 'PUT') {`);
				code.push(`${tab(4)}options.json = { docs: curr.rows };`);
				code.push(`${tab(3)}}`);
				code.push(`${tab(3)}try {`);
				code.push(`${tab(4)}let response = await httpClient.request(options);`);
				code.push(`${tab(4)}results.push(response);`);
				code.push(`${tab(4)}curr.statusCode = response.statusCode;`);
				code.push(`${tab(4)}curr.headers = response.headers;`);
				code.push(`${tab(4)}curr.responseBody = response.body;`);
				code.push(`${tab(3)}} catch(err) {`);
				code.push(`${tab(4)}results.push(err);`);
				code.push(`${tab(4)}curr.statusCode = err.statusCode;`);
				code.push(`${tab(4)}curr.headers = err.headers;`);
				code.push(`${tab(4)}curr.responseBody = err.body;`);
				code.push(`${tab(3)}}`);
				code.push(`${tab(2)}}, Promise.resolve());`);
				// code.push(`${tab(2)}logger.trace(results);`);
				code.push(`${tab(2)}const finalRecords = _.flatten(results.map(e => e.body));`);
				code.push(`${tab(2)}const finalHeader = Object.assign.apply({}, _.flatten(results.map(e => e.headers)));`);
			} else {
				code.push(`${tab(2)}if (options.method == 'POST' || options.method == 'PUT') {`);
				code.push(`${tab(3)}options.json = customBody;`);
				code.push(`${tab(2)}}`);
				code.push(`${tab(2)}logger.trace({ options });`);
				code.push(`${tab(2)}let response = await httpClient.request(options);`);
				code.push(`${tab(2)}const finalRecords = response.body;`);
				code.push(`${tab(2)}const finalHeader = response.headers;`);
			}
			// code.push(`${tab(2)}response = { statusCode: 200, body: finalRecords, headers: finalHeader }`);
			code.push(`${tab(2)}state.statusCode = 200;`);
			code.push(`${tab(2)}response = _.cloneDeep(state);`);
			code.push(`${tab(2)}response.body = finalRecords;`);
			code.push(`${tab(2)}response.headers = finalHeader;`);

			// code.push(`${tab(2)}if (options.method == 'POST' || options.method == 'PUT') {`);
			// code.push(`${tab(3)}options.json = customBody;`);
			// code.push(`${tab(2)}}`);

			// code.push(`${tab(2)}logger.info(\`[\${req.header('data-stack-txn-id')}] [\${req.header('data-stack-remote-txn-id')}] Request URL of ${_.camelCase(node._id)} \`, options.url);`);
			// code.push(`${tab(2)}logger.trace(\`[\${req.header('data-stack-txn-id')}] [\${req.header('data-stack-remote-txn-id')}] Request Data of ${_.camelCase(node._id)} \`, JSON.stringify(options));`);
			// code.push(`${tab(2)}let response = await httpClient.request(options);`);


			code.push(`${tab(2)}commonUtils.handleResponse(response, state, req, node);`);
			code.push(`${tab(2)}logger.info(\`[\${req.header('data-stack-txn-id')}] [\${req.header('data-stack-remote-txn-id')}] Response Status Code of ${_.camelCase(node._id)} \`, state.statusCode);`);
			code.push(`${tab(2)}logger.trace(\`[\${req.header('data-stack-txn-id')}] [\${req.header('data-stack-remote-txn-id')}] Response Data of ${_.camelCase(node._id)} \`, JSON.stringify(state));`);
			if (node.dataStructure && node.dataStructure.outgoing && node.dataStructure.outgoing._id) {
				code.push(`${tab(2)}if (state.statusCode == 200) {`);
				code.push(`${tab(3)}const errors = validationUtils.${functionName}(req, response.body);`);
				code.push(`${tab(3)}commonUtils.handleValidation(errors, state, req, node);`);
				code.push(`${tab(2)}}`);
			}
			code.push(`${tab(2)}if (state.statusCode != 200) {`);
			code.push(`${tab(3)}logger.info(\`[\${req.header('data-stack-txn-id')}] [\${req.header('data-stack-remote-txn-id')}] Ending ${_.camelCase(node._id)} Node with not 200\`, response.statusCode);`);
			code.push(`${tab(2)}} else {`);
			code.push(`${tab(2)}logger.info(\`[\${req.header('data-stack-txn-id')}] [\${req.header('data-stack-remote-txn-id')}] Ending ${_.camelCase(node._id)} Node with 200\`);`);
			code.push(`${tab(2)}}`);
			code.push(`${tab(2)}return _.cloneDeep(state);`);
			// code.push(`${tab(2)}return { statusCode: state.statusCode, body: state.body, headers: state.headers };`);
		} else if ((node.type === 'TRANSFORM' || node.type === 'MAPPING') && node.mappings) {
			code.push(`${tab(2)}let newBody = {};`);
			node.mappings.forEach(mappingData => {
				const formulaCode = [];
				const formulaID = 'formula_' + _.camelCase(uuid());
				mappingData.formulaID = formulaID;
				formulaCode.push(`function ${formulaID}(data) {`);
				mappingData.source.forEach((source, i) => {
					formulaCode.push(`let input${i + 1} =  _.get(data, '${source.dataPath}');`);
				});
				if (mappingData.formula) {
					formulaCode.push(mappingData.formula);
				} else if (mappingData.source && mappingData.source.length > 0) {
					formulaCode.push('return input1;');
				}
				formulaCode.push('}');
				code.push(formulaCode.join('\n'));
			});
			code.push(`${tab(2)}if (Array.isArray(state.body)) {`);
			code.push(`${tab(2)}newBody = [];`);
			code.push(`${tab(3)}state.body.forEach(item => {`);
			code.push(`${tab(2)}let tempBody = {};`);
			node.mappings.forEach(mappingData => {
				code.push(`${tab(4)}_.set(tempBody, '${mappingData.target.dataPath}', ${mappingData.formulaID}(item));`);
			});
			code.push(`${tab(2)}newBody.push(tempBody);`);
			code.push(`${tab(3)}});`);
			code.push(`${tab(2)}} else {`);
			node.mappings.forEach(mappingData => {
				code.push(`${tab(3)}_.set(newBody, '${mappingData.target.dataPath}', ${mappingData.formulaID}(state.body));`);
			});
			code.push(`${tab(2)}}`);

			if (node.dataStructure && node.dataStructure.outgoing && node.dataStructure.outgoing._id) {
				code.push(`${tab(2)}const errors = validationUtils.${functionName}(req, newBody);`);
				code.push(`${tab(2)}if (errors) {`);
				code.push(`${tab(3)}state.status = "ERROR";`);
				code.push(`${tab(3)}state.statusCode = 400;`);
				code.push(`${tab(3)}state.body = { message: errors };`);
				code.push(`${tab(3)}logger.info(\`[\${req.header('data-stack-txn-id')}] [\${req.header('data-stack-remote-txn-id')}] Validation Error ${_.camelCase(node._id)} \`, errors);`);
				code.push(`${tab(3)}logger.info(\`[\${req.header('data-stack-txn-id')}] [\${req.header('data-stack-remote-txn-id')}] Ending ${_.camelCase(node._id)} Node with not 200\`);`);
				code.push(`${tab(3)}return _.cloneDeep(state);`);
				// code.push(`${tab(3)}return { statusCode: 400, body: { message: errors }, headers: response.headers };`);
				code.push(`${tab(2)}}`);
			}
			code.push(`${tab(2)}state.statusCode = 200;`);
			code.push(`${tab(2)}state.status = 'SUCCESS';`);
			code.push(`${tab(2)}state.body = newBody;`);
			code.push(`${tab(2)}return _.cloneDeep(state);`);
			// code.push(`${tab(2)}return { statusCode: 200, body: newBody, headers: state.headers };`);
		} else if (node.type === 'UNWIND') {
			code.push(`${tab(2)}let newBody = [];`);
			code.push(`${tab(2)}if (Array.isArray(state.body)) {`);
			code.push(`${tab(3)}newBody = [];`);
			code.push(`${tab(3)}newBody = state.body.map(item => {`);
			code.push(`${tab(4)}const tempBody = _.get(item, '${node.options.unwindPath}');`);
			code.push(`${tab(4)}newBody = newBody.concat(tempBody);`);
			code.push(`${tab(3)}});`);
			code.push(`${tab(2)}} else {`);
			code.push(`${tab(3)}newBody = _.get(state.body, '${node.options.unwindPath}');`);
			code.push(`${tab(2)}}`);

			if (node.dataStructure && node.dataStructure.outgoing && node.dataStructure.outgoing._id) {
				code.push(`${tab(2)}const errors = validationUtils.${functionName}(req, newBody);`);
				code.push(`${tab(2)}if (errors) {`);
				code.push(`${tab(3)}state.status = "ERROR";`);
				code.push(`${tab(3)}state.statusCode = 400;`);
				code.push(`${tab(3)}state.body = { message: errors };`);
				code.push(`${tab(3)}logger.info(\`[\${req.header('data-stack-txn-id')}] [\${req.header('data-stack-remote-txn-id')}] Validation Error ${_.camelCase(node._id)} \`, errors);`);
				code.push(`${tab(3)}logger.info(\`[\${req.header('data-stack-txn-id')}] [\${req.header('data-stack-remote-txn-id')}] Ending ${_.camelCase(node._id)} Node with not 200\`);`);
				code.push(`${tab(3)}return _.cloneDeep(state);`);
				code.push(`${tab(2)}}`);
			}
			code.push(`${tab(2)}state.statusCode = 200;`);
			code.push(`${tab(2)}state.status = 'SUCCESS';`);
			code.push(`${tab(2)}state.body = newBody;`);
			code.push(`${tab(2)}return _.cloneDeep(state);`);
		} else if (node.type === 'VALIDATION' && node.validation) {
			code.push(`${tab(2)}let errors = {};`);
			Object.keys(node.validation).forEach(field => {
				const formulaID = 'formula_' + _.camelCase(uuid());
				node.validation[field] = {
					code: node.validation[field],
					formulaID
				};
				const formulaCode = [];
				formulaCode.push(`function ${formulaID}(data) {`);
				formulaCode.push(`${tab(1)}try {`);
				formulaCode.push(`${tab(2)}${node.validation[field].code}`);
				formulaCode.push(`${tab(1)}} catch(err) {`);
				formulaCode.push(`${tab(2)}logger.error(err);`);
				formulaCode.push(`${tab(2)}throw err;`);
				formulaCode.push(`${tab(1)}}`);
				formulaCode.push('}');
				code.push(formulaCode.join('\n'));
			});
			code.push(`${tab(2)}if (Array.isArray(state.body)) {`);
			code.push(`${tab(3)}errors = [];`);
			code.push(`${tab(3)}state.body.forEach(item => {`);
			code.push(`${tab(4)}let error;`);
			code.push(`${tab(4)}let errorObj;`);
			Object.keys(node.validation).forEach(field => {
				code.push(`${tab(4)}error = ${node.validation[field].formulaID}(item);`);
				code.push(`${tab(4)}if (error) {`);
				code.push(`${tab(5)}errorObj['${field}'] = error;`);
				code.push(`${tab(4)}}`);
			});
			code.push(`${tab(3)}if (Object.keys(errorObj).length > 0) {`);
			code.push(`${tab(4)}errors.push(errorObj);`);
			code.push(`${tab(3)}}`);
			code.push(`${tab(3)}});`);
			code.push(`${tab(3)}if (errors && errors.length > 0) {`);
			code.push(`${tab(4)}state.status = 'ERROR'`);
			code.push(`${tab(4)}state.statusCode = 400;`);
			code.push(`${tab(4)}state.body = errors;`);
			code.push(`${tab(4)}logger.info(\`[\${req.header('data-stack-txn-id')}] [\${req.header('data-stack-remote-txn-id')}] Validation Error ${_.camelCase(node._id)} \`, errors);`);
			// code.push(`${tab(4)}return { statusCode: 400, body: errors, headers: state.headers };`);
			code.push(`${tab(4)}return _.cloneDeep(state);`);
			code.push(`${tab(3)}}`);
			code.push(`${tab(2)}} else {`);
			code.push(`${tab(3)}let error;`);
			Object.keys(node.validation).forEach(field => {
				code.push(`${tab(3)}error = ${node.validation[field].formulaID}(state.body);`);
				code.push(`${tab(3)}if (error) {`);
				code.push(`${tab(4)}errors['${field}'] = error;`);
				code.push(`${tab(3)}}`);
			});
			code.push(`${tab(3)}if (Object.keys(errors).length > 0) {`);
			code.push(`${tab(4)}state.status = 'ERROR'`);
			code.push(`${tab(4)}state.statusCode = 400;`);
			code.push(`${tab(4)}state.body = errors;`);
			code.push(`${tab(4)}logger.info(\`[\${req.header('data-stack-txn-id')}] [\${req.header('data-stack-remote-txn-id')}] Validation Error ${_.camelCase(node._id)} \`, errors);`);
			// code.push(`${tab(4)}return { statusCode: 400, body: errors, headers: state.headers };`);
			code.push(`${tab(4)}return _.cloneDeep(state);`);
			code.push(`${tab(3)}}`);
			code.push(`${tab(2)}}`);
			// code.push(`${tab(2)}return { statusCode: 200, body: state.body, headers: state.headers };`);
			code.push(`${tab(2)}state.statusCode = 200;`);
			code.push(`${tab(2)}return _.cloneDeep(state);`);
		} else if (node.type === 'FOREACH' || node.type === 'REDUCE') {
			loopCode = generateNodes(node);
			code.push(`${tab(2)}let temp = JSON.parse(JSON.stringify(state.body));`);
			code.push(`${tab(2)}if (!Array.isArray(temp)) {`);
			code.push(`${tab(3)}temp = [temp]`);
			code.push(`${tab(2)}}`);
			if (node.type === 'FOREACH') {
				code.push(`${tab(2)}promises = temp.map(async(data) => {`);
				code.push(`${tab(2)}let response = { headers: state.headers, body: data };`);
				node.nodes.forEach((st, si) => {
					code.push(`${tab(2)}state = stateUtils.getState(response, '${st._id}', true);`);
					code.push(`${tab(2)}response = await ${_.camelCase(st._id)}(req, state, node);`);
					code.push(`${tab(2)}if (response.statusCode >= 400) {`);
					code.push(`${tab(3)}state.status = 'ERROR'`);
					code.push(`${tab(3)}state.statusCode = response.statusCode;`);
					code.push(`${tab(3)}state.body = response.body;`);
					if (st.onError && st.onError.length > 0) {
						code.push(`${tab(3)}state = stateUtils.getState(response, '${st.onError[0]._id}', true);`);
						code.push(`${tab(3)}await ${_.camelCase(st.onError[0]._id)}(req, state, node);`);
					} else {
						code.push(`${tab(3)}return { statusCode: response.statusCode, body: response.body, headers: response.headers };`);
					}
					code.push(`${tab(2)}}`);
					if (node.nodes.length - 1 === si) {
						code.push(`${tab(3)}return { statusCode: response.statusCode, body: response.body, headers: response.headers };`);
					}
				});
				code.push(`${tab(2)}});`);
				code.push(`${tab(2)}promises = await Promise.all(promises);`);
				code.push(`${tab(2)}state.status = 'SUCCESS';`);
				code.push(`${tab(2)}state.statusCode = 200;`);
				code.push(`${tab(2)}state.body = promises.map(e => e.body);`);
				code.push(`${tab(2)}return _.cloneDeep(state);`);
				// code.push(`${tab(2)}return { statusCode: 200, body: promises.map(e=>e.body), headers: state.headers };`);
			} else {
				// code.push(`${tab(2)}promises = await temp.reduce(async(response, data) => {`);
				// code.push(`${tab(2)}let response = { headers: state.headers, body: data };`);
				// node.nodes.forEach(st => {
				// 	code.push(`${tab(2)}state = stateUtils.getState(response, '${st._id}');`);
				// 	code.push(`${tab(2)}response = await ${_.camelCase(st._id)}(req, state, node);`);
				// 	code.push(`${tab(2)}if (response.statusCode >= 400) {`);
				// 	if (st.onError && st.onError.length > 0) {
				// 		code.push(`${tab(3)}state = stateUtils.getState(response, '${st.onError[0]._id}');`);
				// 		code.push(`${tab(3)}await ${_.camelCase(st.onError[0]._id)}(req, state, node);`);
				// 	} else {
				// 		code.push(`${tab(3)}return { statusCode: response.statusCode, body: response.body, headers: response.headers };`);
				// 	}
				// 	code.push(`${tab(2)}}`);
				// });
				// code.push(`${tab(2)}});`);
				// code.push(`${tab(2)}return { statusCode: 200, body: promises.body, headers: state.headers };`);
			}
		} else {
			code.push(`${tab(2)}state.statusCode = 200;`);
			code.push(`${tab(2)}return _.cloneDeep(state);`);
			// code.push(`${tab(2)}return { statusCode: 200, body: state.body, headers: state.headers };`);
		}
		code.push(`${tab(1)}} catch (err) {`);
		code.push(`${tab(2)}commonUtils.handleError(err, state, req, node);`);
		code.push(`${tab(2)}logger.error(\`[\${req.header('data-stack-txn-id')}] [\${req.header('data-stack-remote-txn-id')}] Ending ${_.camelCase(node._id)} Node with\`,state.statusCode);`);
		code.push(`${tab(2)}return _.cloneDeep(state);`);
		// code.push(`${tab(2)}return { statusCode: state.statusCode, body: err, headers: state.headers };`);
		code.push(`${tab(1)}} finally {`);
		code.push(`${tab(2)}node['${node._id}'] = state;`);
		code.push(`${tab(2)}stateUtils.upsertState(req, state);`);
		code.push(`${tab(1)}}`);
		code.push('}');
	});
	return _.concat(code, loopCode, exportsCode).join('\n');
}

function parseDynamicVariable(value) {
	if (value) {
		return value.replace('{{', '${').replace('}}', '}');
	}
}

function parseHeaders(headers) {
	let tempHeaders = {};
	if (headers) {
		if (typeof headers === 'object') {
			Object.keys(headers).forEach(key => {
				tempHeaders[key] = parseHeaders(headers[key]);
			});
		} else if (typeof headers === 'string' && headers.indexOf('{{') > -1) {
			return parseDynamicVariable(headers);
		} else {
			return headers;
		}
	}
	return JSON.stringify(tempHeaders);
}

function parseBody(body) {
	let tempBody = {};
	if (body) {
		if (typeof body === 'object') {
			Object.keys(body).forEach(key => {
				tempBody[key] = parseBody(body[key]);
			});
		} else if (typeof body === 'string' && body.indexOf('{{') > -1) {
			return parseDynamicVariable(body);
		} else {
			return body;
		}
	}
	return JSON.stringify(tempBody);
}


function parseDataStructures(dataJson) {
	visitedValidation = [];
	const code = [];
	code.push('const fs = require(\'fs\');');
	code.push('const path = require(\'path\');');
	code.push('const log4js = require(\'log4js\');');
	code.push('const Ajv = require(\'ajv\');');
	code.push('const _ = require(\'lodash\');');
	code.push('');
	code.push('const ajv = new Ajv();');
	code.push('const logger = log4js.getLogger(global.loggerName);');
	code.push('');
	if (dataJson.dataStructures && Object.keys(dataJson.dataStructures).length > 0) {
		Object.keys(dataJson.dataStructures).forEach(schemaID => {
			code.push(`let schema_${schemaID} = fs.readFileSync(\`./schemas/${schemaID}.schema.json\`).toString();`);
			code.push(`schema_${schemaID} = JSON.parse(schema_${schemaID});`);
			code.push(`const validate_${schemaID} = ajv.compile(schema_${schemaID});`);
		});
	}
	return _.concat(code, generateDataStructures(dataJson.inputNode, dataJson.nodes)).join('\n');
}

function generateDataStructures(node, nodes) {
	let code = [];
	const exportsCode = [];
	let schemaID;
	if (node.dataStructure && node.dataStructure.outgoing && node.dataStructure.outgoing._id) {
		schemaID = (node.dataStructure.outgoing._id);
	}
	const functionName = 'validate_structure_' + _.camelCase(node._id);
	exportsCode.push(`module.exports.${functionName} = ${functionName};`);
	code.push(`function ${functionName}(req, data) {`);
	if (schemaID) {
		code.push(`${tab(1)}const errors = {};`);
		code.push(`${tab(1)}logger.info(\`[\${req.header('data-stack-txn-id')}] [\${req.header('data-stack-remote-txn-id')}] Validation Data Structure ${_.camelCase(node._id)} Node\`);`);
		code.push(`${tab(1)}if (Array.isArray(data)) {`);
		code.push(`${tab(2)}for (let i=0;i<data.length;i++) {`);
		code.push(`${tab(3)}const item = data[i];`);
		code.push(`${tab(3)}const valid = validate_${schemaID}(item);`);
		code.push(`${tab(3)}if (!valid) errors[i] = ajv.errorsText(validate_${schemaID}.errors);`);
		code.push(`${tab(2)}}`);
		code.push(`${tab(1)}} else {`);
		code.push(`${tab(2)}const valid = validate_${schemaID}(data);`);
		code.push(`${tab(2)}if (!valid) errors['0'] = ajv.errorsText(validate_${schemaID}.errors);`);
		code.push(`${tab(1)}}`);
		code.push(`${tab(1)}if (!_.isEmpty(errors)) {`);
		code.push(`${tab(2)}throw new Error(errors);`);
		code.push(`${tab(1)}}`);
	} else {
		code.push(`${tab(1)}logger.info(\`[\${req.header('data-stack-txn-id')}] [\${req.header('data-stack-remote-txn-id')}] No Data Structure found for ${_.camelCase(node._id)} Node\`);`);
	}
	code.push(`${tab(1)}return null;`);
	code.push('}');
	let tempNodes = (node.onSuccess || []);
	for (let index = 0; index < tempNodes.length; index++) {
		const ss = tempNodes[index];
		const nextNode = nodes.find(e => e._id === ss._id);
		if (visitedValidation.indexOf(nextNode._id) > -1) {
			return;
		}
		visitedValidation.push(nextNode._id);
		code = code.concat(generateDataStructures(nextNode, nodes));
	}
	return _.concat(code, exportsCode).join('\n');
}


function parseDataStructuresForFileUtils(dataJson) {
	const code = [];
	code.push('const _ = require(\'lodash\');');
	code.push('const commonUtils = require(\'./common.utils\');');
	if (dataJson.dataStructures && Object.keys(dataJson.dataStructures).length > 0) {
		Object.keys(dataJson.dataStructures).forEach(schemaId => {
			const definition = dataJson.dataStructures[schemaId].definition;
			// Function to return array of values;
			code.push(`function getValuesOf${schemaId} (data) {`);
			code.push(`${tab(1)}const values = [];`);
			definition.forEach(def => {
				const properties = def.properties;
				code.push(`${tab(1)}values.push(_.get(data, '${properties.dataKey}') || '');`);
			});
			code.push(`${tab(1)}return values;`);
			code.push('}');
			// Function to return array of headers;
			code.push(`function getHeaderOf${schemaId} () {`);
			code.push(`${tab(1)}const headers = [];`);
			definition.forEach(def => {
				const properties = def.properties;
				code.push(`${tab(1)}headers.push('${properties.name}');`);
			});
			code.push(`${tab(1)}return headers;`);
			code.push('}');


			// Function to Convert Data from CSV to JSON;
			code.push(`function convertData${schemaId} (rowData) {`);
			code.push(`${tab(1)}const tempData = {};`);
			definition.forEach(def => {
				const properties = def.properties;
				if (def.type == 'Number') {
					code.push(`${tab(1)}_.set(tempData, '${(properties.dataPath || properties.key)}', +(_.get(rowData, '${(properties.dataPath || properties.key)}')));`);
				} else if (def.type == 'Boolean') {
					code.push(`${tab(1)}_.set(tempData, '${(properties.dataPath || properties.key)}', commonUtils.convertToBoolean(_.get(rowData, '${(properties.dataPath || properties.key)}')));`);
				} else if (def.type == 'Date') {
					code.push(`${tab(1)}_.set(tempData, '${(properties.dataPath || properties.key)}', commonUtils.convertToDate(_.get(rowData, '${(properties.dataPath || properties.key)}'), '${properties.dateFormat || 'yyyy-MM-dd'}'));`);
				} else {
					code.push(`${tab(1)}_.set(tempData, '${(properties.dataPath || properties.key)}', _.get(rowData, '${(properties.dataPath || properties.key)}'));`);
				}
			});
			code.push(`${tab(1)}return tempData;`);
			code.push('}');

			code.push(`module.exports.getValuesOf${schemaId} = getValuesOf${schemaId}`);
			code.push(`module.exports.getHeaderOf${schemaId} = getHeaderOf${schemaId}`);
			code.push(`module.exports.convertData${schemaId} = convertData${schemaId}`);
		});
	}
	return code.join('\n');
}




module.exports.parseFlow = parseFlow;
module.exports.parseNodes = parseNodes;
module.exports.parseDataStructures = parseDataStructures;
module.exports.parseDataStructuresForFileUtils = parseDataStructuresForFileUtils;