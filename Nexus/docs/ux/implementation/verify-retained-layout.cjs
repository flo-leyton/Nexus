const ts=require('typescript'),assert=require('node:assert/strict');
const files=['components/session/SessionUI.tsx','components/session/SessionPage.tsx','components/session/NodeRoleEditorView.tsx','components/session/SessionHeader.tsx','components/studio/StudioHome.tsx'];
function normalize(source,file){
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const transformed=ts.transform(ast,[context=>{const visit=node=>{
   if(ts.isImportDeclaration(node)&&node.moduleSpecifier.text==='@/components/retainedVisibility')return undefined;
   if(ts.isJsxAttribute(node)&&node.name.text==='style')return undefined;
   if(ts.isPropertyAssignment(node)&&node.name.getText(ast)==='hidden')return ts.factory.updatePropertyAssignment(node,node.name,ts.factory.createObjectLiteralExpression());
   return ts.visitEachChild(node,visit,context);
 };return root=>ts.visitNode(root,visit);}]);
 const result=ts.createPrinter().printFile(transformed.transformed[0]);transformed.dispose();return result;
}
function assertPresentationOnly(before,after,file){assert.equal(normalize(after,file),normalize(before,file),'Non-style structure/handlers changed: '+file);}
function playbackSignature(source){const ast=ts.createSourceFile('player.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=[];const printer=ts.createPrinter();
 function visit(n){if((ts.isCallExpression(n)&&['useVideoPlayer','useEvent'].includes(n.expression.getText(ast)))||(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ast)==='VideoView'))nodes.push(printer.printNode(ts.EmitHint.Unspecified,n,ast));ts.forEachChild(n,visit);}visit(ast);return nodes;
}
module.exports={files,assertPresentationOnly,playbackSignature};
