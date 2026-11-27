import { readFileSync } from 'node:fs';
const read = name => JSON.parse(readFileSync(new URL(`../src/content/${name}.json`, import.meta.url),'utf8'));
const vocabulary=read('vocabulary'), verbs=read('verbs'), grammar=read('grammar'), encounters=read('encounters');
const fail=message=>{throw new Error(message)};
const text=(value,label)=>{if(typeof value!=='string'||!value.trim())fail(`Missing text: ${label}`)};
for(const [name,items] of Object.entries({vocabulary,verbs,grammar})){
 if(!Array.isArray(items)||!items.length)fail(`${name}: empty or invalid array`);
 const ids=new Set();for(const item of items){text(item.id,`${name}.id`);if(ids.has(item.id))fail(`Duplicate ${name}: ${item.id}`);ids.add(item.id);if(!['A1','A2','B1','B2'].includes(item.tier))fail(`Invalid tier: ${item.id}`);if(name!=='verbs'&&typeof item.needs_review!=='boolean')fail(`Missing review flag: ${item.id}`);}
}
for(const v of vocabulary){text(v.lemma,v.id);text(v.english,v.id);if(!['noun','verb','phrase','adjective','preposition'].includes(v.partOfSpeech))fail(`Invalid word class: ${v.id}`);if(v.partOfSpeech==='noun'&&!['m','f'].includes(v.gender))fail(`Missing gender: ${v.id}`);}
for(const v of verbs){text(v.infinitive,v.id);text(v.english,v.id);if(v.forms){if(v.forms.length!==6)fail(`Six forms required: ${v.id}`);v.forms.forEach(f=>text(f,v.id));}else if(!['er','ir'].includes(v.regular))fail(`Missing conjugation class: ${v.id}`);}
for(const g of grammar){if(!verbs.some(v=>v.id===g.verbId)||g.tense!=='present')fail(`Invalid grammar: ${g.id}`);text(g.explanation,g.id);text(g.english,g.id);}
for(const token of encounters.caretaker.tokens){if(typeof token.text!=='string'||!token.text.length)fail('Missing dialogue token');if(token.vocab&&!vocabulary.some(v=>v.id===token.vocab))fail(`Unknown word: ${token.vocab}`);}
for(const key of ['name','greeting','clue','question','success','failure'])text(encounters.caretaker[key],key);
const replyIds=new Set();for(const r of encounters.caretaker.replies){text(r.id,'reply id');if(replyIds.has(r.id))fail('Duplicate reply');replyIds.add(r.id);text(r.fr,r.id);text(r.en,r.id);if(typeof r.correct!=='boolean')fail('Missing reply result');}
if(encounters.caretaker.replies.filter(r=>r.correct).length!==1)fail('Dialogue needs one correct response');
for(const d of Object.values(encounters.doors)){text(d.fr,'door');text(d.en,'door');if(!vocabulary.some(v=>v.id===d.vocab))fail('Invalid door reference');}
const spellIds=new Set();for(const s of encounters.spells){if(spellIds.has(s.id))fail('Duplicate spell');spellIds.add(s.id);for(const k of ['name','description','flavor'])text(s[k],s.id);if(!verbs.some(v=>v.id===s.verbId)||!grammar.some(g=>g.id===s.grammarId&&g.verbId===s.verbId))fail(`Invalid spell: ${s.id}`);}
console.log(`Content valid: ${vocabulary.length} words/phrases, ${verbs.length} verbs, ${grammar.length} patterns, ${encounters.caretaker.replies.length} replies, ${spellIds.size} spells.`);
