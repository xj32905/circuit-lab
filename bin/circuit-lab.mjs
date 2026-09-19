#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const server=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','server.mjs');
const args=process.argv.slice(2);
const open=args.includes('--open')||!args.includes('--no-open');
const child=spawn(process.execPath,[server,open?'--open':'',...args].filter(Boolean),{stdio:'inherit'});
child.on('exit',code=>process.exit(code??0));
child.on('error',err=>{console.error(err.message);process.exit(1);});
