import re
import sys
import itertools
import os
import json
import uuid
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm.session import sessionmaker

path = os.path.dirname(os.path.realpath(__file__))

sys.path.insert(0, path)

import kb_tools
from kb_tools.kb_io import load_kb
from kb_tools.event import Event
from kb_tools.feature import Feature
from kb_tools.coordinate_notation import VariantNotation
from kb_tools.statement import *
from kb_tools import TSV
from kb_tools.util import ReMatch
from kb_tools.util import PATTERNS as pt
from kb_tools.util import MATCH_TYPE as mt
from kb_tools.disease import Disease
from kb_tools.literature import Literature
from kb_tools.position import Position
import pdb

import doctest
import re
from collections import defaultdict


ref_json = []


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
    'chromosome': 'genome reference consortium (human)',
    'cds': 'transcript'
}


SUBTYPE_MAPPING = {
    '>': 'substitution',
    'mis': 'substitution'
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
        return {'@class': 'cytoband_position', 'major_band': a, 'arm': c, 'minor_band': b}
    elif csys == 'c':
        if c == '-':
            b *= -1
        return {
            '@class': 'coding_sequence_position',
            'pos': a,
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
            '@class': 'exon_position',
            'pos': a
        }
    else:
        raise NotImplementedError('did not account for csys', csys)


def convert_feature(feature):
    return {
        '@class': 'feature',
        'source': feature.type,
        'source_version': feature.version,
        'biotype': BIOTYPE_MAPPING.get(feature.subtype, feature.subtype),
        'name': feature.id
    }


def convert_cv_event(event):
    return {'@class': 'category_event', 'term': event.cv_notation, 'primary_feature': convert_feature(event.name_feature)}


def convert_cn_event(event):
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
        m = re.search('(\w?)\*?(\d*)', event.alt)
        if m is not None:
            json_event['untemplated_seq'] = m.group(1)
            json_event['termination_aa'] = m.group(2)
    elif event.alt:
        json_event['untemplated_seq'] = event.alt
    
    if event.ref:
        json_event['reference_seq'] = event.ref

    return json_event


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
                zygosity = zygosity.lower()
                if '(germline)' in zygosity:
                    germline = True
                    zygosity = re.sub('\s*(germline)\s*$', '', zygosity)
                if zygosity in ['ns', 'na']:
                    zygosity = None
                
                if event.type == 'FANN':
                    events.append(convert_feature(event.name_feature))
                    continue
                event_json = {
                    'type': EVENT_TYPE_MAPPING[event.type],
                    'zygosity': zygosity,
                    'germline': germline
                }
                if event.cn_notation:
                    event_json.update(convert_cn_event(event.cn_notation))
                else:
                    event_json.update(convert_cv_event(event))
                events.append(event_json)
            
            #disease
            diseases = []
            if entry.disease != "not specified":
                for dname in entry.disease.split(';'):
                    diseases.append({'@class': 'disease', 'name': dname.strip().lower()})
            else:
                diseases = [None]
            # publication
            if entry.literature.type == 'pubmed':
                pub = {
                    'pmid': entry.literature.id,
                    'title': entry.literature.title,
                    '@class': 'publication'
                }
            elif re.match('^(.*\.(ca|com|org|edu)|http.*)$', entry.literature.id) or \
                    'cancer.sanger.ac.uk/cosmic' == entry.literature.id:
                pub = {
                    'url': entry.literature.id,
                    'title': entry.literature.title,
                    '@class': 'external_source'
                }
            elif entry.literature.id in ['ampliseq panel V2', 'IBM']:
                pub = {
                    'url': None,
                    'title': entry.literature.id.lower(),
                    '@class': 'external_source'
                }
            elif entry.literature.title.lower() in ['oncopanel', 'pog - unpublished', 'pog', 'captur']:
                name = entry.literature.title.lower()
                if name == 'pog - unpublished':
                    name = 'pog'
                pub = {
                    'official_title': name,
                    '@class': 'clinical_trial'
                }
            elif entry.literature.id.lower() in ['oncopanel', 'pog - unpublished', 'pog', 'captur', 'bcgsc - pog']:
                name = entry.literature.id.lower()
                if name in ['pog - unpublished', 'pog', 'bcgsc - pog']:
                    name = 'pog'
                pub = {
                    'official_title': name,
                    '@class': 'clinical_trial'
                }
            elif entry.literature.type in ['', 'other'] and re.match('^\d+$', entry.literature.id):
                pub = {
                    'pmid': entry.literature.id,
                    'title': entry.literature.title,
                    '@class': 'publication'
                }
            elif entry.literature.id == 'not specified':
                pub = None
            else:
                print('warning: unsupported lit type', repr(entry.literature.type), repr(entry.literature.id))
                unresolved += 1
                continue
            
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
                
                if entry.statement.type in ['diagnostic', 'occurrence'] or relevance in ['pathogenic', 'recurrent']:
                    if disease is None and entry.statement.type == 'diagnostic':
                        if entry.evidence == 'clinical-test' or entry.literature.id == 'ampliseq panel V2':
                            stat['applies_to'].extend(events)
                            new_entries.append(stat)
                            continue
                        print('warning: cant resolve entry without disease', entry)
                        nonsensical_entries += 1
                        continue
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
                                print('unexpected. gene annotations should only have one event')
                                nonsensical_entries += 1
                                continue
                            stat['applies_to'].extend(events)
                            new_entries.append(stat)
                            continue
                        elif any([
                            'function' in relevance,
                            'dominant' in relevance,
                            relevance in ['likely oncogenic', 'oncogenic']
                        ]):
                            if len(events) != 1:
                                unresolved += 1
                                print('warning complex: functional statement with more than one event')
                                continue
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
                            print(entry)
                            unresolved += 1
                            continue
                        elif 'fusion' in relevance:
                            if len(events) != 1:
                                manual_intervention_req += 1
                                print('MANUAL', relevance, entry)
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
                                print('MANUAL', relevance, events)
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
            print('*********** warning: skipping problem entry', repr(err), entry)
            print()
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


if __name__ == "__main__":
    main()

