import {copyFile,mkdir} from 'node:fs/promises';
await mkdir('public/resource-preview',{recursive:true});
await copyFile('node_modules/unpdf/dist/pdfjs.mjs','public/resource-preview/pdfjs.mjs');
