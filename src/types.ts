
interface GraphKbRecord {
    '@rid': string
}

type RecordOrId = string | GraphKbRecord;

interface StatementInput {
    conditions: RecordOrId[];
    evidence: RecordOrId[];
    subject: RecordOrId;
    relevance: RecordOrId;
    evidenceLevel: RecordOrId;
    source?: RecordOrId;
    sourceId?: string;
    description?: string;
}



export {StatementInput, RecordOrId, GraphKbRecord};
