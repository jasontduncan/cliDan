import * as dotenv from 'dotenv'
dotenv.config()

// import support for require() in ES6
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
const require = createRequire(import.meta.url),
  __filename = fileURLToPath(import.meta.url),
  __dirname = dirname(__filename);

import { program } from 'commander';
import { exec }   from "child_process";
const { v1: uuidv1 } = require('uuid')
const { Configuration, OpenAIApi } = require( "openai" );
const fs = require('fs')


const BYTES_PER_PAGE = 3000 * 3; // 2000 tokens, 3-ish bytes per token

const config = new Configuration({
  organization: process.env.OPENAI_API_ORG,
  apiKey: process.env.OPENAI_API_KEY
})

const openai = new OpenAIApi(config);

program.parse();
const input = program.args.join(' ').replace("'", "\\'");
if( !input ) {
  throw new Error("No input provided");
}

const systemMessage = 
  "You are a BASH_TOOL operator. You are given some context, the BASH_TOOL, and a task to perform. Your job is to determine whether the task can be performed using only the provided context and the BASH_TOOL, which can run typical Bash CLI commands. If the task can not be accomplished, point out exactly what information or capability is missing. If so, list the steps you would take using the format:\n/\\/\\BASH_TOOL INPUT_VALUE\n. For example: /\\/\\BASH_TOOL ls -l.\n List as many formatted commands as needed to complete the task, but answer ONLY with cli commands prepended with /\\/\\BASH_TOOL; Since your output will be executed on the command line, avoid including comments or explanations. If an explanation is required, you MUST chain it together with your CLI command, using 'echo' or 'cat' to output it. Request output that is colored and formatted to make it as human-readable as possible";

const task =
input;

const context =
""

const tools =
["BASH_TOOL"].join("\n");
async function requestCompletion(args = {}) {
  const messages = args.messageList;

  try {
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: args.messageList,
      temperature: 1
    })

    //console.log("Token usage:", completion.data.usage);
    return completion.data;
  } catch(e) {
    console.error("There's been a problem.");
    console.error("Details...");
    console.error(e.stack)
  }
}
const bashTool = async (command) => {
  return await new Promise((resolve, reject) => {
    try {
      exec( command, (error, stdout, stderr) => {
        if( error ) {
          resolve("BASH TOOL ERROR TRYING TO "+ command +"\n"+ error.message);
        }

        resolve( stdout.substring(0, BYTES_PER_PAGE) );

      });
    } catch (e) {
      resolve("BASH TOOL ERROR TRYING TO "+ command +"\n"+ e.message);
    }
  });
}
let memoryFileData = [];
try {
  const memoryFileText = fs.readFileSync('./.aimemory/cliDans_memory.json', 'utf8')
  
  memoryFileData = JSON.parse(memoryFileText);
} catch(e) {
  console.log("No memory file found. One will be created.");
}

const message = {
  role: 'user',
  content: "CONTEXT: "+ context +"\n"+ "TOOLS: "+ tools +"\n"+ "TASK: "+ task
},
  jobDescription = {role: 'system', content: systemMessage}
const messageHistory = memoryFileData || [];
const messageList = [
  ...messageHistory,
  message
]

console.log("User:", task);
const request = {
  messageList: [jobDescription, ...messageList]
}
const completion = await requestCompletion(request),
  reply = completion.choices[0].message.content,
  bashToolCommand = reply.split('BASH_TOOL')[1];

if( !!bashToolCommand ) {
  const [actualCommand, comment] = bashToolCommand.split('\n');
  console.log("cliDan:", bashToolCommand, '\n', await bashTool(actualCommand));
  if( !!comment ) {
    console.log("cliDan:", comment);
  }
} else {
  console.log("FAILED::cliDan:", reply);
}

messageList.push( {role: 'assistant', content: reply} );
if( !fs.existsSync('./.aimemory') ) {
  fs.mkdirSync('./.aimemory');
}
fs.writeFileSync('./.aimemory/cliDans_memory.json', JSON.stringify(messageList));
