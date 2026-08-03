'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);
function asBool(value, fallback = false) { if (value === undefined || value === null || value === '') return fallback; return ['1','true','yes','sim','on'].includes(String(value).toLowerCase()); }

async function encryptFile(source, destination, passphrase) {
  const salt=crypto.randomBytes(16), iv=crypto.randomBytes(12);
  const key=crypto.scryptSync(String(passphrase),salt,32);
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  await fs.promises.mkdir(path.dirname(destination),{recursive:true,mode:0o700});
  const out=fs.createWriteStream(destination,{mode:0o600});
  out.write(Buffer.concat([Buffer.from('HUBENC1'),salt,iv]));
  await new Promise((resolve,reject)=>{const input=fs.createReadStream(source);input.on('error',reject);cipher.on('error',reject);out.on('error',reject);out.on('finish',resolve);input.pipe(cipher).pipe(out,{end:false});cipher.on('end',()=>{out.write(cipher.getAuthTag());out.end();});});
  return destination;
}
class ExternalBackupManager {
  constructor({ database, backupManager, dataDir, env = process.env }) {
    this.db=database;this.backups=backupManager;this.dataDir=dataDir;this.env=env;this.running=false;this.timer=null;
    this.statusPath=path.join(dataDir,'external-backup-status.json');
  }
  settings(){const s=this.db.getSettings();return{enabled:asBool(s.external_backups_enabled,false),intervalHours:Math.max(1,Math.min(168,Number(s.external_backup_interval_hours||24))),remote:String(s.external_backup_remote||'').trim(),dailyKeep:Math.max(1,Math.min(30,Number(s.external_backup_daily_keep||7))),weeklyKeep:Math.max(1,Math.min(24,Number(s.external_backup_weekly_keep||4))),preupdateKeep:Math.max(1,Math.min(10,Number(s.external_backup_preupdate_keep||3)))};}
  status(){let saved={};try{saved=JSON.parse(fs.readFileSync(this.statusPath,'utf8'));}catch{}return{...saved,running:this.running,settings:this.settings(),configured:Boolean(this.env.HUB_BACKUP_PASSPHRASE&&this.settings().remote)};}
  writeStatus(patch){const next={...this.status(),...patch,updatedAt:new Date().toISOString()};delete next.running;delete next.settings;delete next.configured;const tmp=`${this.statusPath}.tmp-${process.pid}`;fs.writeFileSync(tmp,JSON.stringify(next,null,2),{mode:0o600});fs.renameSync(tmp,this.statusPath);}
  async transfer(filePath, remote, fileName){if(remote.startsWith('file:')){const dir=path.resolve(remote.slice(5));await fs.promises.mkdir(dir,{recursive:true,mode:0o700});await fs.promises.copyFile(filePath,path.join(dir,fileName));return path.join(dir,fileName);}await execFileAsync('rclone',['copyto',filePath,`${remote.replace(/\/$/,'')}/${fileName}`],{timeout:30*60*1000,maxBuffer:2*1024*1024});return `${remote.replace(/\/$/,'')}/${fileName}`;}
  async pruneRemote(remote, reason){if(!remote.startsWith('file:'))return;const dir=path.resolve(remote.slice(5));const settings=this.settings();const keep=reason==='pre-update'?settings.preupdateKeep:reason==='weekly'?settings.weeklyKeep:settings.dailyKeep;const names=(await fs.promises.readdir(dir).catch(()=>[])).filter(n=>n.startsWith(`hub-bot-${reason}-`)&&n.endsWith('.zip.enc'));const files=[];for(const name of names){const p=path.join(dir,name);try{files.push({p,mtime:(await fs.promises.stat(p)).mtimeMs});}catch{}}files.sort((a,b)=>b.mtime-a.mtime);await Promise.all(files.slice(keep).map(f=>fs.promises.rm(f.p,{force:true})));}
  async run(reason='daily') {if(this.running)throw new Error('Já existe um backup externo em andamento.');const settings=this.settings();if(!settings.remote)throw new Error('Configure o destino externo do backup.');const pass=this.env.HUB_BACKUP_PASSPHRASE;if(!pass||pass.length<12)throw new Error('Defina HUB_BACKUP_PASSPHRASE com ao menos 12 caracteres no .env.');this.running=true;let full=null,encrypted='';try{full=await this.backups.createFullZip({includeSession:true});const stamp=new Date().toISOString().replace(/[:.]/g,'-');const name=`hub-bot-${reason}-${stamp}.zip.enc`;encrypted=path.join(this.dataDir,name);await encryptFile(full.path,encrypted,pass);const destination=await this.transfer(encrypted,settings.remote,name);await this.pruneRemote(settings.remote,reason);this.writeStatus({lastBackupAt:new Date().toISOString(),lastFile:name,lastDestination:destination,lastError:'',lastReason:reason});return{name,destination,reason};}catch(error){this.writeStatus({lastError:error.message,lastReason:reason});throw error;}finally{if(encrypted)await fs.promises.rm(encrypted,{force:true}).catch(()=>{});this.running=false;}}
  schedule(){clearTimeout(this.timer);this.timer=null;const s=this.settings();if(!s.enabled)return;const last=this.status().lastBackupAt?new Date(this.status().lastBackupAt).getTime():0;const due=Math.max(Date.now()+5000,last+s.intervalHours*3600000);this.timer=setTimeout(async()=>{this.timer=null;try{await this.run(new Date().getUTCDay()===0?'weekly':'daily');}catch(e){console.error('Backup externo:',e.message);}finally{this.schedule();}},Math.max(1000,due-Date.now()));this.timer.unref?.();}
  start(){this.schedule();}reload(){this.schedule();}stop(){clearTimeout(this.timer);this.timer=null;}
}
module.exports={ExternalBackupManager,encryptFile};
