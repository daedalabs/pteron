import {build,Platform,Arch} from 'electron-builder';
const artifactName=process.argv[2];
if(artifactName&&!/^[a-zA-Z0-9._-]+\.exe$/.test(artifactName))throw new Error('Installer artifact name must be a plain .exe filename');
await build({targets:Platform.WINDOWS.createTarget('nsis',Arch.x64),config:{extends:'electron-builder.yml',...(artifactName?{nsis:{artifactName}}:{})}});
