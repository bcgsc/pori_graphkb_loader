import re
import sys
import itertools
import os
import json
import uuid
from datetime import datetime
import requests

path = os.path.dirname(os.path.realpath(__file__))

sys.path.insert(0, path)

from kb_tools.kb_io import load_kb

ref_json = []


ERROR_MSG_CACHE = {}

def submit_to_json(ref_json, entry_hash, event):
    uuid_str = str(uuid.uuid4())
    ref_json[uuid_str].append(dict(entry_hash, **event))


EVENT_TYPE_MAPPING = {
    'SV': 'structural variant',
    'CNV': 'copy number variant',
    'ELV-RNA': 'RNA expression level variant',
    'ELV-PROT': 'protein expression level variant',
    'MUT': 'mutation'
}

BIOTYPE_MAPPING = {
    'gene fusion': 'fusion',
    'chromosome': 'template',
    'cds': 'transcript'
}


SUBTYPE_MAPPING = {
    '>': 'substitution',
    'mis': 'substitution',
    'del': 'deletion',
    'fs': 'frameshift',
    'ins': 'insertion',
    'delins': 'indel',
    'copyloss': 'loss',
    'copygain': 'gain',
    'dup': 'duplication',
    'spl': 'splice-site'
}

SOURCE_MAPPING = {
    'chromosome': 'genome reference consortium (human)'
}


def convert_position(pos):
    a = pos.a
    b = pos.b
    c = pos.c
    csys = pos.csys
    if a is not None and a < 0:
        a = None
    if b is not None and b < 0:
        b = None

    if csys == 'y':
        if a is None and b is not None:
            raise UserWarning('bad entry for position', a, b, c)
        return {'@class': 'cytoband_position', 'major_band': a, 'arm': c, 'minor_band': b}
    elif csys == 'c':
        if c == '-':
            b *= -1
        return {
            '@class': 'coding_sequence_position',
            'pos': a if a != 0 else 1,
            'offset': b
        }
    elif csys == 'p':
        return {
            '@class': 'protein_position',
            'pos': a,
            'ref_aa': c
        }
    elif csys == 'g':
        return {
            '@class': 'genomic_position',
            'pos': a
        }
    elif csys == 'e':
        return {
            '@class': 'exonic_position',
            'pos': a
        }
    else:
        raise NotImplementedError('did not account for csys', csys)


def convert_feature(feature):
    if feature.type == '?':
        raise UserWarning('unspecified source', feature)
    return {
        '@class': 'feature',
        'source': SOURCE_MAPPING.get(feature.type, feature.type),
        'source_version': re.sub('^v', '', feature.version) if feature.version else feature.version,
        'biotype': BIOTYPE_MAPPING.get(feature.subtype, feature.subtype),
        'name': feature.id
    }


def convert_cv_event(event):
    return {'@class': 'category_event', 'term': event.cv_notation, 'primary_feature': convert_feature(event.name_feature)}


def convert_source(lit_type, ext_id, title):
    lit_type = lit_type.lower()
    if ext_id:
        ext_id = ext_id.lower()
    if title:
        title = title.lower()

    if re.match('^\d+$', ext_id):
        lit_type = 'pubmed'

    trial_names = {
        'oncopanel': 'oncopanel',
        'oncopanel - cgl': 'oncopanel',
        'pog - unpublished': 'personalized oncogenomics (pog)',
        'pog': 'personalized oncogenomics (pog)',
        'captur': 'captur',
        'bcgsc - pog': 'personalized oncogenomics (pog)',
        'bcgsc-pog': 'personalized oncogenomics (pog)'
    }

    if lit_type == 'pubmed':
        pub = {
            'pmid': int(ext_id),
            'title': title,
            '@class': 'publication'
        }
        pub.update(supplement_pmid(ext_id, title))
        return pub
    elif lit_type == 'pmcid' or lit_type == 'doi':
        raise UserWarning('(convert_source) not supported', lit_type, ext_id, title)
    elif title == 'ibm':
        return {'@class': 'external_source', 'title': 'ibm'}
    elif ext_id in trial_names or title in trial_names:
        return {'@class': 'clinical_trial', 'title': trial_names[ext_id] if ext_id in trial_names else trial_names[title]}
    elif title == 'ampliseq panel v2':
        return {'@class': 'external_source', 'title': 'ampliseq panel v2'}
    else:
        url = re.sub('^https?://(www\.)?', '', ext_id)
        result = {'@class': 'external_source', 'url': url}
        if not url:
            raise UserWarning('(convert_source) external source has no url', lit_type, ext_id, title)

        glob_to_title = {
            'cosmic': 'catalogue of somatic mutations in cancer (cosmic)',
            'mycancergenome': 'my cancer genome',
            'foundationone': 'foundation one',
            'mdanderson': 'mdanderson',
            'docm': 'database of curated mutations (docm)',
            'archerdx': 'archerdx',
            'quiver.archer': 'archerdx',
            'intogen': 'intogen',
            'fda.gov': 'food and drug administration (fda)',
            'oncokb': 'oncokb',
            'nccn': 'national comprehensive cancer network (nccn)',
            'cancer.gov': 'national cancer institute (nci)'
        }
        title_matches = []
        for word, title in glob_to_title.items():
            if word in url:
                title_matches.append(title)
        if len(title_matches) > 1:
            raise UserWarning('(convert_source) too many matches, could not resolve external source type', url, title_matches)
        elif len(title_matches) == 0:
            raise UserWarning('(convert_source) could not match url to title', url)
        result['title'] = title_matches[0]
        return result


def convert_cn_event(event):
    if event.csys == 'e' and event.type in ['fs', 'delins', 'spl', 'ins']:
        raise UserWarning('bad event. Exon level events cannot be insertions/deletions or splice-site mutations')
    elif event.type == '?':
        raise UserWarning('bad event type ? is not valid')
    json_event = {
        '@class': 'positional_event',
        'primary_feature': convert_feature(event.feature_x1),
        'subtype': SUBTYPE_MAPPING.get(event.type, event.type)
    }
    if event.bn:
        json_event['secondary_feature'] = convert_feature(event.feature_y1)
    if event.break_x2 is not None and event.break_x2 != event.break_x1:
        json_event['start'] = {
            'start': convert_position(event.break_x1),
            'end': convert_position(event.break_x2),
            '@class': 'range'
        }
    else:
        json_event['start'] = convert_position(event.break_x1)

    if event.break_y2 is not None and event.break_y2 != event.break_y1:
        json_event['end'] = {
            'start': convert_position(event.break_y1),
            'end': convert_position(event.break_y2),
            '@class': 'range'
        }
    elif event.break_y1 is not None:
        json_event['end'] = convert_position(event.break_y1)

    if event.type == 'fs':
        m = re.search('^(\w?)(\*(\d+)?)?$', event.alt)
        if m is not None:
            json_event['untemplated_seq'] = m.group(1)
            json_event['termination_aa'] = m.group(3)
    elif event.alt:
        json_event['untemplated_seq'] = event.alt

    if event.ref:
        json_event['reference_seq'] = event.ref

    return json_event


def strip_title(title):
    title = title.lower()
    title = re.sub('-', ' ', title)
    title = re.sub('[^\w\s]', '', title)
    title = re.sub('^(a|the) ', '', title)
    return title.strip()


PMID_CACHE = {}


def supplement_pmid(pmid, title):
    title = strip_title(title)
    url = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id={}&retmode=json'.format(pmid)
    if pmid in PMID_CACHE:
        resp = PMID_CACHE[pmid]
    else:
        resp = requests.get(url).json()['result'][pmid]
        PMID_CACHE[pmid] = resp

    year_match = re.match('^([12][0-9][0-9][0-9]).*', resp['pubdate'])
    journal_match = re.match('^(.*)(\([^\)]+\))?$', resp['fulljournalname'])

    pub = {
        'title': strip_title(resp['title']),
        'year': int(year_match.group(1)),
        'journal': journal_match.group(1)
    }
    if title and title != pub['title']:
        if re.sub('\s', '', title) != re.sub('\s', '', pub['title']):
            raise UserWarning('titles differ', pmid, repr(title), repr(pub['title']))
    return pub


def new_statement(type, relevance):
    return {
        '@class': 'statement',
        'applies_to': [],
        'requires': [],
        'as_compared_to': [],
        'relevance': relevance,
        'type': type,
        'supported_by': []
    }


def main():
    print('[LOADING] ({0}) the knowledgebase flatfiles'.format(datetime.now()))
    kb = load_kb(
        'mini_knowledge_base_events.tsv',
        'knowledge_base_references.tsv',
        'disease_ontology.tsv'
    )
    print('loading the pmid cache:', 'pmid_cache.json')
    with open('pmid_cache.json', 'r') as fh:
        data = json.load(fh)
        PMID_CACHE.update(data)
    new_entries = []
    unresolved = 0
    manual_intervention_req = 0
    nonsensical_entries = 0
    TS = set()
    ONC = set()
    for ekey, entry in list(kb.entries.items()):
        if len(entry.combination.events) != 1:
            continue
        ev = entry.combination.events[0][0]
        if ev.type != 'FANN':
            continue
        feat = ev.name_feature.id
        if entry.statement.type == 'biological':
            if entry.statement.relevance in ['oncogene', 'putative oncogene']:
                ONC.add(feat)
            elif entry.statement.relevance in ['tumour suppressor', 'putative tumour suppressor']:
                TS.add(feat)
    both = ONC & TS
    ONC = ONC - both
    TS = ONC - both

    for ekey, entry in list(kb.entries.items()):
        try:
            events = []
            for event, presence_flag, zygosity in entry.combination.events:
                germline = False
                zygosity = zygosity.lower().strip()
                if '(germline)' in zygosity:
                    germline = True
                    zygosity = re.sub('\s*\(germline\)\s*$', '', zygosity)
                if zygosity in ['ns', 'na', 'any']:
                    zygosity = None

                if event.type == 'FANN':
                    events.append(convert_feature(event.name_feature))
                    continue
                event_json = {
                    'type': EVENT_TYPE_MAPPING[event.type],
                    'zygosity': zygosity,
                    'germline': germline,
                    'absence_of': not presence_flag
                }
                if event.cn_notation:
                    if event.notation.feature_x1.type == '?':
                        raise UserWarning('unsupported event')
                    event_json.update(convert_cn_event(event.cn_notation))
                else:
                    if event.name_feature.type == '?':
                        raise UserWarning('unsupported event')
                    event_json.update(convert_cv_event(event))
                events.append(event_json)

            # disease
            diseases = []
            if entry.disease != "not specified":
                for dname in entry.disease.split(';'):
                    diseases.append({'@class': 'disease', 'name': dname.strip().lower()})
            else:
                diseases = [None]
            # publication
            pub = convert_source(entry.literature.type, entry.literature.id, entry.literature.title)

            context = [c.strip().lower() for c in entry.statement.context.split(';')]
            for context, disease in itertools.product(context, diseases):
                relevance = entry.statement.relevance
                if relevance == 'inconclusive' or ('uncertain functional effect' in context and relevance == 'not determined'):
                    relevance = 'inconclusive functional effect'
                elif relevance == 'not specified' and context == 'cancer associated gene':
                    relevance = 'associated-with'
                stat = new_statement(entry.statement.type, relevance)
                if pub:
                    stat['supported_by'].append(pub)
                    if pub['@class'] == 'publication' and not pub.get('journal', None):
                        raise UserWarning('bad entry. publication does not specify a journal')

                if entry.statement.type in ['diagnostic', 'occurrence'] or relevance in ['pathogenic', 'recurrent']:
                    if disease is None and entry.statement.type == 'diagnostic':
                        if entry.evidence == 'clinical-test' or entry.literature.id == 'ampliseq panel V2':
                            stat['applies_to'].extend(events)
                            new_entries.append(stat)
                            continue
                        nonsensical_entries += 1
                        raise UserWarning('cant resolve diagnostic/occurrence entry without disease')
                    stat['applies_to'].append(disease)
                else:
                    if disease is not None:
                        stat['requires'].append(disease)

                    if entry.statement.type == 'biological':
                        if any([
                            any([x + 'oncogene' == relevance for x in ['', 'likely ', 'putative ']]),
                            any([x + 'tumour suppressor' == relevance for x in ['', 'likely ', 'putative ']]),
                            'haploinsufficient' == relevance,
                            'cancer associated gene' == relevance,
                            'associated-with' == relevance and context == 'cancer associated gene'
                        ]):
                            if len(events) != 1:
                                nonsensical_entries += 1
                                raise UserWarning('unexpected. gene annotations should only have one event')
                            stat['applies_to'].extend(events)
                            new_entries.append(stat)
                            continue
                        elif any([
                            'function' in relevance,
                            'dominant' in relevance,
                            relevance in ['likely oncogenic', 'oncogenic']
                        ]):
                            if len(events) != 1:
                                raise UserWarning('warning complex: functional statement with more than one event')
                            if 'secondary_feature' in events[0]:
                                f1 = events[0]['primary_feature']['name']
                                f2 = events[0]['secondary_feature']['name']
                                if f1 == f2:
                                    stat['applies_to'].append(events[0]['primary_feature'])
                                else:
                                    stat['applies_to'].append(events[0]['primary_feature'])
                                    stat['applies_to'].append(events[0]['secondary_feature'])
                            else:
                                stat['applies_to'].append(events[0]['primary_feature'])
                        elif relevance in ['not determined', 'not specified', 'inconclusive']:
                            raise UserWarning('not determined/not specified/inconclusive relevance')
                        elif 'fusion' in relevance:
                            if len(events) != 1:
                                manual_intervention_req += 1
                                continue
                            f1 = events[0]['primary_feature']['name']
                            f2 = events[0]['secondary_feature']['name']
                            if f1 == f2:
                                stat['applies_to'].append(events[0]['primary_feature'])
                            else:
                                stat['applies_to'].append(events[0]['primary_feature'])
                                stat['applies_to'].append(events[0]['secondary_feature'])
                        elif relevance in ['recurrent', 'test target', 'mutation hotspot']:
                            stat['applies_to'].extend(events)
                            new_entries.append(stat)
                            continue
                        elif 'pathway' in relevance:
                            stat['applies_to'].append({'@class': 'target', 'name': context, 'type': 'pathway'})
                        elif relevance == 'cooperative-events':
                            feat = events[0]['primary_feature']
                            flag = False
                            for ev in events:
                                if 'secondary_feature' in ev or ev['primary_feature']['name'] != feat['name']:
                                    flag = True
                                    break
                            if flag:
                                manual_intervention_req += 1
                                continue
                            stat['applies_to'].append(feat)
                        elif relevance == 'associated-with':
                            if context == 'cancer associated gene':
                                stat['applies_to']
                            stat['applies_to'].append({'@class': 'target', 'name': context, 'type': 'phenotype'})
                    elif entry.statement.type == 'therapeutic':
                        for tname in re.split('\s*\+\s*', context):
                            stat['applies_to'].append({'@class': 'therapy', 'name': tname})
                    elif entry.statement.type == 'prognostic':
                        pass
                    else:
                        raise NotImplementedError('logic not defined for', entry.statement.type)
                stat['requires'].extend(events)
                if len(stat['applies_to']) < 1 and entry.statement.type != 'prognostic':
                    raise NotImplementedError('not handling applies_to', entry, stat, context, diseases)
                new_entries.append(stat)
        except Exception as err:
            if isinstance(err, NotImplementedError):
                raise err
            s = repr(err)
            if s not in ERROR_MSG_CACHE:
                print('skipping problem entry', repr(err))
                ERROR_MSG_CACHE[s] = None
            unresolved += 1
    print(
        'unresolved:', unresolved,
        'manual intervention required:', manual_intervention_req,
        'nonsensical:', nonsensical_entries,
        'parsed:', len(new_entries)
    )
    json_str = json.dumps({'entries': new_entries})
    with open('new_entries.json', 'w') as fh:
        print('writing: new_entries.json')
        fh.write(json_str)

    #with open('pmid_cache.json', 'w') as fh:
    #    print('writing: pmid_cache.json')
    #    fh.write(json.dumps(PMID_CACHE))


if __name__ == "__main__":
    main()
