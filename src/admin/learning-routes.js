'use strict';

module.exports = async function handleRoute(server, req, res, url, deps) {
  const { fs, path, crypto, os, execFileSync, spawn, json, text, readBody, readBuffer, streamFile, safeStreamWrite, httpError, runtimeCompatibility, TRIGGER_POLICY_TYPES, previewLearningImpact, simulateConversation, runConsistencyCheck, systemHealth, importTeachersCsv, importLinksCsv, importAutomaticMessagesCsv, parseProfessorScheduleFile, parseAcademicCalendarCsv, normalizeText } = deps;
  const route = url.pathname;
  return await (async function dispatch() {
    if (route === '/api/learning-suggestion-groups' && req.method === 'GET') return json(res, 200, this.db.listLearningSuggestionGroups?.({ state: url.searchParams.get('state') || 'pending' }) || []);
    if (route === '/api/learning-suggestions/archive-expired' && req.method === 'POST') return json(res, 200, await this.mutateDatabase('archiveExpiredLearningSuggestions', [], { reason: 'learning-suggestions-archived', reloadRules: false }));
    const impactMatch = route.match(/^\/api\/learning-impact\/(positive|negative|discipline_alias)\/(\d+)$/);
    if (impactMatch && req.method === 'POST') { const body=await readBody(req); const impact=previewLearningImpact({db:this.db,engine:this.engine,type:impactMatch[1],id:impactMatch[2],applyPattern:Boolean(body.apply_pattern)}); return json(res,200,this.db.saveLearningImpactPreview({suggestion_type:impactMatch[1],suggestion_id:impactMatch[2],impact})); }
    const reviewObservation = route.match(/^\/api\/quality\/observations\/(\d+)$/);
    if (reviewObservation && req.method === 'PATCH') { const body=await readBody(req); return json(res,200,{ok:this.db.reviewTriggerObservation(reviewObservation[1],body.state||'reviewed')}); }
    const reviewFalsePositive = route.match(/^\/api\/quality\/false-positives\/(\d+)$/);
    if (reviewFalsePositive && req.method === 'PATCH') { const body=await readBody(req); return json(res,200,{ok:this.db.reviewFalsePositiveReport(reviewFalsePositive[1],body.state||'reviewed')}); }
    const observationMessage = route.match(/^\/api\/messages\/(\d+)\/observation$/);
    if (observationMessage && req.method === 'PUT') { const body=await readBody(req); return json(res,200,await this.mutateDatabase('setAutomaticMessageObservationMode',[observationMessage[1],body.enabled!==false],{reason:'message-observation-mode'})); }
    const policyMessage = route.match(/^\/api\/messages\/(\d+)\/trigger-policy$/);
    if (policyMessage && req.method === 'PUT') { const body=await readBody(req); return json(res,200,await this.mutateDatabase('setAutomaticMessageTriggerPolicy',[policyMessage[1],body],{reason:'message-trigger-policy'})); }
    if (route === '/api/learning-suggestions' && req.method === 'GET') return json(res, 200, this.db.listUnrecognizedSuggestions({ state: url.searchParams.get('state') || 'pending', limit: url.searchParams.get('limit') || 200 }));
    const approveLearning = route.match(/^\/api\/learning-suggestions\/(\d+)\/approve$/);
    if (approveLearning && req.method === 'POST') { const body=await readBody(req); const preview=this.db.getLearningImpactPreview?.('positive',approveLearning[1]); if(this.db.getSetting('learning_impact_preview_enabled','true')==='true'&&!preview) throw httpError('Gere a prévia de impacto antes de aprovar.',409); return json(res,200,await this.mutateDatabase('approveUnrecognizedSuggestion',[approveLearning[1],body],{reason:'learning-suggestion-approved',reloadRules:true})); }
    const rejectLearning = route.match(/^\/api\/learning-suggestions\/(\d+)\/reject$/);
    if (rejectLearning && req.method === 'POST') return json(res, 200, await this.mutateDatabase('rejectUnrecognizedSuggestion', [rejectLearning[1]], { reason: 'learning-suggestion-rejected', reloadRules: false }));
    
    if (route === '/api/negative-example-suggestions' && req.method === 'GET') return json(res, 200, this.db.listNegativeExampleSuggestions({ state: url.searchParams.get('state') || 'pending', limit: url.searchParams.get('limit') || 200 }));
    const approveNegativeExample = route.match(/^\/api\/negative-example-suggestions\/(\d+)\/approve$/);
    if (approveNegativeExample && req.method === 'POST') { const body=await readBody(req); const preview=this.db.getLearningImpactPreview?.('negative',approveNegativeExample[1]); if(this.db.getSetting('learning_impact_preview_enabled','true')==='true'&&!preview) throw httpError('Gere a prévia de impacto antes de aprovar.',409); return json(res,200,await this.mutateDatabase('approveNegativeExampleSuggestion',[approveNegativeExample[1],body],{reason:'negative-example-approved',reloadRules:true})); }
    const rejectNegativeExample = route.match(/^\/api\/negative-example-suggestions\/(\d+)\/reject$/);
    if (rejectNegativeExample && req.method === 'POST') return json(res, 200, await this.mutateDatabase('rejectNegativeExampleSuggestion', [rejectNegativeExample[1]], { reason: 'negative-example-rejected', reloadRules: false }));
    
    if (route === '/api/discipline-alias-suggestions' && req.method === 'GET') return json(res, 200, this.db.listDisciplineAliasSuggestions({ state: url.searchParams.get('state') || 'pending', limit: url.searchParams.get('limit') || 200 }));
    const approveDisciplineAlias = route.match(/^\/api\/discipline-alias-suggestions\/(\d+)\/approve$/);
    if (approveDisciplineAlias && req.method === 'POST') { const body=await readBody(req); const preview=this.db.getLearningImpactPreview?.('discipline_alias',approveDisciplineAlias[1]); if(this.db.getSetting('learning_impact_preview_enabled','true')==='true'&&!preview) throw httpError('Gere a prévia de impacto antes de aprovar.',409); return json(res,200,await this.mutateDatabase('approveDisciplineAliasSuggestion',[approveDisciplineAlias[1],body],{reason:'discipline-alias-approved',reloadRules:true})); }
    const rejectDisciplineAlias = route.match(/^\/api\/discipline-alias-suggestions\/(\d+)\/reject$/);
    if (rejectDisciplineAlias && req.method === 'POST') return json(res, 200, await this.mutateDatabase('rejectDisciplineAliasSuggestion', [rejectDisciplineAlias[1]], { reason: 'discipline-alias-rejected', reloadRules: false }));
    
    if (route === '/api/regression-cases' && req.method === 'GET') return json(res, 200, this.db.listRegressionCases({ activeOnly: url.searchParams.get('active') === '1' }));
    if (route === '/api/regression-cases' && req.method === 'POST') return json(res, 201, await this.mutateDatabase('saveRegressionCase', [await readBody(req)], { reason: 'regression-case-created', reloadRules: false }));
    const regressionCase = route.match(/^\/api\/regression-cases\/(\d+)$/);
    if (regressionCase && req.method === 'PUT') return json(res, 200, await this.mutateDatabase('saveRegressionCase', [await readBody(req), regressionCase[1]], { reason: 'regression-case-updated', reloadRules: false }));
    if (regressionCase && req.method === 'DELETE') return json(res, 200, await this.mutateDatabase('deleteRegressionCase', [regressionCase[1]], { reason: 'regression-case-deleted', reloadRules: false }));
    if (route === '/api/regression-cases/run' && req.method === 'POST') {
      const cases = this.db.listRegressionCases({ activeOnly: true });
      const results = cases.map(item => {
        const evaluation = this.engine.simulate(item.phrase, { isGroup: false, includeDrafts: false });
        const responded = Boolean(evaluation?.matched && evaluation.type !== 'disambiguation');
        const titleOk = !item.expected_title || normalizeText(evaluation?.matchedItem || '').includes(normalizeText(item.expected_title));
        const passed = item.expectation === 'ignore' ? !responded : responded && titleOk;
        return { id: item.id, phrase: item.phrase, expectation: item.expectation, expected_title: item.expected_title, passed,
          actual: responded ? (evaluation.matchedItem || evaluation.type || 'resposta') : (evaluation.blockedBy || 'ignorada') };
      });
      return json(res, 200, { total: results.length, passed: results.filter(item => item.passed).length,
        failed: results.filter(item => !item.passed).length, ok: results.every(item => item.passed), results });
    }
    return json(res, 404, { error: 'Rota não encontrada.' });
  }).call(server);
};
