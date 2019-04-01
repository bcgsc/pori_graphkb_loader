const SOURCE = {
    url: 'https://cancer.sanger.ac.uk/cosmic',
    name: 'cosmic',
    sourceId: 'cosmic',
    usage: 'https://cancer.sanger.ac.uk/cosmic/license'
};

const VERSION = '2019-03-29';
const URL = 'https://cancer.sanger.ac.uk/cosmic/signatures';

const RECORDS = [
    {
        sourceId: '1',
        aetiology: 'Signature 1 is the result of an endogenous mutational process initiated by spontaneous deamination of 5-methylcytosine',
        additional: 'Signature 1 is associated with small numbers of small insertions and deletions in most tissue types.',
        comments: 'The number of Signature 1 mutations correlates with age of cancer diagnosis',
        name: 'Age'
    },
    {
        sourceId: '2',
        aetiology: `
            Signature 2 has been attributed to activity of the AID/APOBEC family of cytidine
            deaminases. On the basis of similarities in the sequence context of cytosine
            mutations caused by APOBEC enzymes in experimental systems, a role for APOBEC1,
            APOBEC3A and/or APOBEC3B in human cancer appears more likely than for other members
            of the family.`,
        additional: 'Transcriptional strand bias of mutations has been observed in exons, but is not present or is weaker in introns.',
        comments: `
            Signature 2 is usually found in the same samples as Signature 13. It has been proposed
            that activation of AID/APOBEC cytidine deaminases is due to viral infection,
            retrotransposon jumping or to tissue inflammation. Currently, there is limited
            evidence to support these hypotheses. A germline deletion polymorphism involving
            APOBEC3A and APOBEC3B is associated with the presence of large numbers of Signature
            2 and 13 mutations and with predisposition to breast cancer. Mutations of similar
            patterns to Signatures 2 and 13 are commonly found in the phenomenon of local
            hypermutation present in some cancers, known as kataegis, potentially implicating
            AID/APOBEC enzymes in this process as well.`,
        cancers: ['cervical cancer', 'breast cancer'],
        genes: ['APOBEC1', 'APOBEC3A', 'APOBEC3B']
    },
    {
        sourceId: '3',
        aetiology: 'Signature 3 is associated with failure of DNA double-strand break-repair by homologous recombination.',
        additional: `
            Signature 3 associates strongly with elevated numbers of large (longer than 3bp)
            insertions and deletions with overlapping microhomology at breakpoint junctions.`,
        comments: `
            Signature 3 is strongly associated with germline and somatic BRCA1 and BRCA2
            mutations in breast, pancreatic, and ovarian cancers. In pancreatic cancer,
            responders to platinum therapy usually exhibit Signature 3 mutations.`,
        cancers: ['breast cancer', 'ovarian cancer', 'pancreatic cancer'],
        genes: ['BRCA1', 'BRCA2']
    },
    {
        sourceId: '4',
        aetiology: `
            Signature 4 is associated with smoking and its profile is similar to the mutational
            pattern observed in experimental systems exposed to tobacco carcinogens
            (e.g., benzo[a]pyrene). Signature 4 is likely due to tobacco mutagens.`,
        additional: `
            Signature 4 exhibits transcriptional strand bias for C>A mutations, compatible with
            the notion that damage to guanine is repaired by transcription-coupled nucleotide
            excision repair. Signature 4 is also associated with CC>AA dinucleotide substitutions.
        `,
        comments: 'Signature 29 is found in cancers associated with tobacco chewing and appears different from Signature 4.',
        cancers: ['head and neck cancer', 'liver cancer', 'lung adenocarcinoma', 'lung squamous carcinoma', 'small cell lung carcinoma', 'oesophageal cancer']
    },
    {
        sourceId: '5',
        aetiology: 'The aetiology of Signature 5 is unknown',
        additional: 'Signature 5 exhibits transcriptional strand bias for T>C substitutions at ApTpN context.'
    },
    {
        sourceId: '6',
        aetiology: `
            Signature 6 is associated with defective DNA mismatch repair and is found in
            microsatellite unstable tumours.`,
        additional: `
            Signature 6 is associated with high numbers of small (shorter than 3bp) insertions
            and deletions at mono/polynucleotide repeats.`,
        comments: `
            Signature 6 is one of four mutational signatures associated with defective DNA
            mismatch repair and is often found in the same samples as Signatures 15, 20, and 26.`,
        cancers: ['colorectal cancer', 'uterine cancer']
    },
    {
        sourceId: '7',
        aetiology: `
            Based on its prevalence in ultraviolet exposed areas and the similarity of the
            mutational pattern to that observed in experimental systems exposed to ultraviolet
            light Signature 7 is likely due to ultraviolet light exposure.
        `,
        additional: `
            Signature 7 is associated with large numbers of CC>TT dinucleotide mutations at
            dipyrimidines. Additionally, Signature 7 exhibits a strong transcriptional
            strand-bias indicating that mutations occur at pyrimidines (viz., by formation of
            pyrimidine-pyrimidine photodimers) and these mutations are being repaired by
            transcription-coupled nucleotide excision repair.
        `,
        cancers: ['skin cancer', 'head and neck cancer', 'oral squamous cancers']
    },
    {
        sourceId: '8',
        aetiology: 'The aetiology of Signature 8 remains unknown.',
        additional: `
            Signature 8 exhibits weak strand bias for C>A substitutions and is associated with
            double nucleotide substitutions, notably CC>AA.`,
        cancer: ['breast cancer', 'medulloblastoma']
    },
    {
        sourceId: '9',
        aetiology: `
            Signature 9 is characterized by a pattern of mutations that has been attributed to
            polymerase η, which is implicated with the activity of AID during somatic hypermutation.
        `,
        comments: `
            Chronic lymphocytic leukaemias that possess immunoglobulin gene hypermutation
            (IGHV-mutated) have elevated numbers of mutations attributed to Signature 9
            compared to those that do not have immunoglobulin gene hypermutation.`,
        cancers: ['chronic lymphocytic leukaemia', 'malignant B-cell lymphomas']
    },
    {
        sourceId: '10',
        aetiology: `
            It has been proposed that the mutational process underlying this signature is altered
            activity of the error-prone polymerase POLE. The presence of large numbers of
            Signature 10 mutations is associated with recurrent POLE somatic mutations,
            viz., Pro286Arg and Val411Leu.`,
        additional: `
            Signature 10 exhibits strand bias for C>A mutations at TpCpT context and T>G mutations
            at TpTpT context.`,
        comments: `
            Signature 10 is associated with some of most mutated cancer samples.
            Samples exhibiting this mutational signature have been termed ultra-hypermutators.`,
        cancers: ['colorectal cancer', 'uterine cancer'],
        genes: ['POLE']
    },
    {
        sourceId: '11',
        aetiology: `
            Signature 11 exhibits a mutational pattern resembling that of alkylating agents.
            Patient histories have revealed an association between treatments with the
            alkylating agent temozolomide and Signature 11 mutations.`,
        additional: `
            Signature 11 exhibits a strong transcriptional strand-bias for C>T substitutions
            indicating that mutations occur on guanine and that these mutations are effectively
            repaired by transcription-coupled nucleotide excision repair.`,
        cancers: ['melanoma', 'glioblastoma']
    },
    {
        sourceId: '12',
        aetiology: 'The aetiology of Signature 12 remains unknown',
        additional: 'Signature 12 exhibits a strong transcriptional strand-bias for T>C substitutions.',
        comments: 'Signature 12 usually contributes a small percentage (<20%) of the mutations observed in a liver cancer sample.',
        cancers: ['liver cancer']
    },
    {
        sourceId: '13',
        aetiology: `
            Signature 13 has been attributed to activity of the AID/APOBEC family of cytidine
            deaminases converting cytosine to uracil. On the basis of similarities in the
            sequence context of cytosine mutations caused by APOBEC enzymes in experimental
            systems, a role for APOBEC1, APOBEC3A and/or APOBEC3B in human cancer appears more
            likely than for other members of the family. Signature 13 causes predominantly C>G
            mutations. This may be due to generation of abasic sites after removal of uracil by
            base excision repair and replication over these abasic sites by REV1.`,
        additional: `
            Transcriptional strand bias of mutations has been observed in exons, but is not present
            or is weaker in introns.`,
        comments: `
            Signature 2 is usually found in the same samples as Signature 13. It has been proposed
            that activation of AID/APOBEC cytidine deaminases is due to viral infection,
            retrotransposon jumping or to tissue inflammation. Currently, there is limited
            evidence to support these hypotheses. A germline deletion polymorphism involving
            APOBEC3A and APOBEC3B is associated with the presence of large numbers of Signature
            2 and 13 mutations and with predisposition to breast cancer. Mutations of similar
            patterns to Signatures 2 and 13 are commonly found in the phenomenon of local
            hypermutation present in some cancers, known as kataegis, potentially implicating
            AID/APOBEC enzymes in this process as well.`
    },
    {
        sourceId: '14',
        aetiology: ' The aetiology of Signature 14 remains unknown.',
        comments: 'Signature 14 generates very high numbers of somatic mutations (>200 mutations per MB) in all samples in which it has been observed.',
        cancer: ['uterine cancer', 'adult low-grade glioma']
    },
    {
        sourceId: '15',
        aetiology: 'Signature 15 is associated with defective DNA mismatch repair.',
        additional: `
            Signature 15 is associated with high numbers of small (shorter than 3bp) insertions
            and deletions at mono/polynucleotide repeats.`,
        comments: `
            Signature 15 is one of four mutational signatures associated with defective DNA
            mismatch repair and is often found in the same samples as Signatures 6, 20, and 26.`,
        cancer: ['stomach cancer', 'small cell lung carcinoma']
    },
    {
        sourceId: '16',
        aetiology: 'The aetiology of Signature 16 remains unknown.',
        additional: `
            Signature 16 exhibits an extremely strong transcriptional strand bias for T>C
            mutations at ApTpN context, with T>C mutations occurring almost exclusively on
            the transcribed strand.`,
        cancer: ['liver cancer']
    },
    {
        sourceId: '17',
        aetiology: 'The aetiology of Signature 17 remains unknown.',
        cancer: ['oesophagus cancer', 'breast cancer', 'liver cancer', 'lung adenocarcinoma', 'B-cell lymphoma', 'stomach cancer', 'melanoma']
    },
    {
        sourceId: '18',
        aetiology: 'The aetiology of Signature 18 remains unknown.',
        cancer: ['neuroblastoma', 'breast carcinoma', 'stomach carcinoma']
    },
    {
        sourceId: '19',
        aetiology: 'The aetiology of Signature 19 remains unknown.',
        cancers: ['pilocytic astrocytoma']
    },
    {
        sourceId: '20',
        aetiology: 'Signature 20 is believed to be associated with defective DNA mismatch repair.',
        additional: `
            Signature 20 is associated with high numbers of small (shorter than 3bp) insertions
            and deletions at mono/polynucleotide repeats.`,
        comments: `
            Signature 20 is one of four mutational signatures associated with
            defective DNA mismatch repair and is often found in the same samples as Signatures 6,
            15, and 26.`,
        cancers: ['stomach cancer', 'breast cancer']
    },
    {
        sourceId: '21',
        aetiology: 'The aetiology of Signature 21 remains unknown.',
        comments: `
            Signature 21 is found only in four samples all generated by the same sequencing
            centre. The mutational pattern of Signature 21 is somewhat similar to the one of
            Signature 26. Additionally, Signature 21 is found only in samples that also have
            Signatures 15 and 20. As such, Signature 21 is probably also related to
            microsatellite unstable tumours.`,
        cancers: ['stomach cancer']
    },
    {
        sourceId: '22',
        aetiology: `
            Signature 22 has been found in cancer samples with known exposures to aristolochic
            acid. Additionally, the pattern of mutations exhibited by the signature is consistent
            with the one previous observed in experimental systems exposed to aristolochic acid.`,
        additional: `
            Signature 22 exhibits a very strong transcriptional strand bias for T>A mutations
            indicating adenine damage that is being repaired by transcription-coupled nucleotide
            excision repair.`,
        comments: `
            Signature 22 has a very high mutational burden in urothelial carcinoma;
            however, its mutational burden is much lower in liver cancers.`,
        cancers: ['urothelial carcinoma', 'renal pelvis carcinoma', 'liver cancer']
    },
    {
        sourceId: '23',
        aetiology: 'The aetiology of Signature 23 remains unknown.',
        additional: 'Signature 23 exhibits very strong transcriptional strand bias for C>T mutations.',
        cancers: ['liver cancer']
    },
    {
        sourceId: '24',
        aetiology: `
            Signature 24 has been found in cancer samples with known exposures to aflatoxin.
            Additionally, the pattern of mutations exhibited by the signature is consistent
            with that previous observed in experimental systems exposed to aflatoxin.`,
        additional: `
            Signature 24 exhibits a very strong transcriptional strand bias for C>A mutations
            indicating guanine damage that is being repaired by transcription-coupled nucleotide
            excision repair.`,
        cancers: ['liver cancer']
    },
    {
        sourceId: '25',
        aetiology: 'The aetiology of Signature 25 remains unknown.',
        additional: 'Signature 25 exhibits transcriptional strand bias for T>A mutations.',
        comments: `
            This signature has only been identified in Hodgkin’s cell lines.
            Data is not available from primary Hodgkin lymphomas.`,
        cancers: ['Hodgkin lymphoma']
    },
    {
        sourceId: '26',
        aetiology: 'Signature 26 is believed to be associated with defective DNA mismatch repair.',
        additional: `
            Signature 26 is associated with high numbers of small (shorter than 3bp) insertions
            and deletions at mono/polynucleotide repeats.`,
        comments: `
            Signature 26 is one of four mutational signatures associated with defective
            DNA mismatch repair and is often found in the same samples as Signatures 6, 15 and 20.`,
        cancer: ['breast cancer', 'cervical cancer', 'stomach cancer', 'uterine carcinoma']
    },
    {
        sourceId: '27',
        aetiology: 'The aetiology of Signature 27 remains unknown.',
        additional: `
            Signature 27 exhibits very strong transcriptional strand bias for T>A mutations.
            Signature 27 is associated with high numbers of small (shorter than 3bp) insertions
            and deletions at mono/polynucleotide repeats.`,
        cancer: ['kidney clear cell carcinoma']
    },
    {
        sourceId: '28',
        aetiology: 'The aetiology of Signature 28 remains unknown.',
        cancers: ['stomach cancer']
    },
    {
        sourceId: '29',
        aetiology: 'Signature 29 has been found in cancer samples from individuals with a tobacco chewing habit.',
        additional: `
            Signature 29 exhibits transcriptional strand bias for C>A mutations indicating
            guanine damage that is most likely repaired by transcription-coupled nucleotide excision
            repair. Signature 29 is also associated with CC>AA dinucleotide substitutions.`,
        comments: `
            The Signature 29 pattern of C>A mutations due to tobacco chewing appears different
            from the pattern of mutations due to tobacco smoking reflected by Signature 4.`,
        cancers: ['gingivo-buccal oral squamous cell carcinoma']
    },
    {
        sourceId: '30',
        aetiology: 'The aetiology of Signature 30 remains unknown.',
        cancers: ['breast cancer']
    }
];
