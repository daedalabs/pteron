import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decomposeTransform} from '../src/core/transform';
test('transform decomposition preserves skew, rotations, reflections and translation',()=>{
 for(const matrix of [{a:1,b:2,c:3,d:4,e:20,f:-30},{a:0,b:2,c:-3,d:0,e:-8,f:4},{a:-1,b:0,c:0,d:2,e:0,f:0},{a:1,b:0,c:.7,d:1,e:12,f:6}]){
  const p=decomposeTransform(matrix);assert.ok(p);const r=p.rotation*Math.PI/180,k=Math.tan(p.skew*Math.PI/180),co=Math.cos(r),si=Math.sin(r);
  const result={a:co*p.scaleX,b:si*p.scaleX,c:(co*k-si)*p.scaleY,d:(si*k+co)*p.scaleY,e:p.x,f:p.y};for(const key of ['a','b','c','d','e','f'] as const)assert.ok(Math.abs(result[key]-matrix[key])<1e-10);
 }
 assert.equal(decomposeTransform({a:0,b:0,c:2,d:1,e:3,f:4}),null);
});
