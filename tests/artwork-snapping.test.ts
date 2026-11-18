import {test} from 'node:test';
import assert from 'node:assert/strict';
import {snapArtwork} from '../src/core/artwork-snapping';

const canvas={x:0,y:0,width:640,height:360};
test('artwork snaps to canvas center and sibling edges within a screen-pixel tolerance',()=>{
 const result=snapArtwork({x:303,y:101,width:40,height:40},[{x:100,y:100,width:40,height:40}],canvas,6);
 assert.equal(result.x,-3);assert.equal(result.y,-1);assert.equal(result.guides.length,2);
 assert.equal(snapArtwork({x:293,y:80,width:40,height:40},[],canvas,6).x,0);
});
test('artwork offers equal spacing between siblings and after an existing pair',()=>{
 const others=[{x:100,y:100,width:40,height:40},{x:220,y:100,width:40,height:40}];
 const middle=snapArtwork({x:162,y:100,width:40,height:40},others,canvas,6);
 assert.equal(middle.x,-2);assert.ok(middle.guides.some(guide=>guide.kind==='gap'));
 const after=snapArtwork({x:337,y:100,width:40,height:40},others,canvas,6);assert.equal(after.x,3);
});
