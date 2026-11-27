import {build} from "esbuild";
import {readFile} from "node:fs/promises";
const packages=["d3-force","d3-dispatch","d3-quadtree","d3-timer"];
const notices=await Promise.all(packages.map(async name=>name+"\n"+await readFile(new URL("../node_modules/"+name+"/LICENSE",import.meta.url),"utf8")));
await build({entryPoints:["src/physics.ts"],bundle:true,format:"esm",platform:"browser",target:"es2022",outfile:"static/physics.js",legalComments:"inline",banner:{js:"/* Third-party licenses\n"+notices.join("\n\n").replaceAll("*/","* /")+"\n*/"}});
