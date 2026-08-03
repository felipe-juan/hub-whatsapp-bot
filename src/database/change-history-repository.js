'use strict';
module.exports = function createMixin({ parseJson, nowIso }) {
  return class {
    recordChangeHistory({ entity_type, entity_id = '', entity_label = '', action = 'updated', source = 'painel', before = null, after = null } = {}) {
      const result = this.db.prepare(`INSERT INTO change_history(entity_type,entity_id,entity_label,action,source,before_json,after_json,created_at,reverted_at)
        VALUES (?,?,?,?,?,?,?,?, '')`).run(String(entity_type||'').slice(0,80),String(entity_id||'').slice(0,120),String(entity_label||'').slice(0,240),String(action||'updated').slice(0,60),String(source||'painel').slice(0,120),JSON.stringify(before),JSON.stringify(after),nowIso());
      this.db.prepare(`DELETE FROM change_history WHERE id NOT IN (SELECT id FROM change_history ORDER BY id DESC LIMIT 2000)`).run();
      return Number(result.lastInsertRowid);
    }
    listChangeHistory({ limit = 200, entityType = '', entityId = '' } = {}) {
      const where=[];const params=[];if(entityType){where.push('entity_type=?');params.push(String(entityType));}if(entityId!==''){where.push('entity_id=?');params.push(String(entityId));}
      const sql=`SELECT * FROM change_history${where.length?` WHERE ${where.join(' AND ')}`:''} ORDER BY id DESC LIMIT ?`;params.push(Math.max(1,Math.min(1000,Number(limit||200))));
      return this.db.prepare(sql).all(...params).map(row=>({...row,id:Number(row.id),before:parseJson(row.before_json,null),after:parseJson(row.after_json,null)}));
    }
    revertChangeHistory(id) {
      const row=this.db.prepare('SELECT * FROM change_history WHERE id=?').get(Number(id));if(!row)throw new Error('Registro de histórico não encontrado.');if(row.reverted_at)throw new Error('Essa alteração já foi revertida.');
      const before=parseJson(row.before_json,null);const numeric=Number(row.entity_id);
      switch(row.entity_type){
        case 'teacher': if(before)this.saveTeacher({...before,_skip_history:true},numeric);else this.deleteTeacher(numeric,{skipHistory:true});break;
        case 'schedule_entry': if(before)this.saveProfessorScheduleEntry({...before,_skip_history:true},numeric);else this.deleteProfessorScheduleEntry(numeric,{skipHistory:true});break;
        case 'academic_calendar': if(before)this.saveAcademicCalendarEvent({...before,_skip_history:true},numeric);else this.deleteAcademicCalendarEvent(numeric,{skipHistory:true});break;
        case 'settings': if(before)this.setSettings(before,true,{skipHistory:true});break;
        default: throw new Error('Este tipo de alteração não pode ser revertido por esta tela.');
      }
      this.db.prepare('UPDATE change_history SET reverted_at=? WHERE id=?').run(nowIso(),Number(id));
      return { reverted:true, id:Number(id), entity_type:row.entity_type, entity_id:row.entity_id };
    }
  };
};
