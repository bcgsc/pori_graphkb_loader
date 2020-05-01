const sources = {
    uberon: {
        name: 'uberon',
        displayName: 'Uberon',
        url: 'http://uberon.github.io',
        description: 'Uberon is an integrated cross-species ontology covering anatomical structures in animals.',
        usage: 'http://obofoundry.github.io/principles/fp-001-open.html',
        comment: 'https://github.com/obophenotype/uberon/issues/1139',
    },
    vario: {
        name: 'vario',
        usage: 'http://variationontology.org/citing.shtml',
        url: 'http://variationontology.org',
        description: 'Variation Ontology, VariO, is an ontology for standardized, systematic description of effects, consequences and mechanisms of variations. VariO allows unambiguous description of variation effects as well as computerized analyses over databases utilizing the ontology for annotation. VariO is a position specific ontology that can be used to describe effects of variations on DNA, RNA and/or protein level, whatever is appropriate.',
    },
    sequenceOntology: {
        name: 'sequence ontology',
        description: 'The Sequence Ontology is a set of terms and relationships used to describe the features and attributes of biological sequence. SO includes different kinds of features which can be located on the sequence.',
        url: 'http://www.sequenceontology.org',
        usage: 'http://www.sequenceontology.org/?page_id=269',
    },
    refseq: {
        displayName: 'RefSeq',
        longName: 'RefSeq: NCBI Reference Sequence Database',
        name: 'refseq',
        url: 'https://www.ncbi.nlm.nih.gov/refseq',
        usage: 'https://www.ncbi.nlm.nih.gov/home/about/policies',
        description: `
            A comprehensive, integrated, non-redundant, well-annotated set of reference sequences
            including genomic, transcript, and protein.`.replace(/\s+/, ' '),
    },
    oncotree: {
        name: 'oncotree',
        url: 'http://oncotree.mskcc.org',
        displayName: 'OncoTree',
        sort: 0,
    },
    oncokb: {
        name: 'oncokb',
        sort: 4, // 4th preferred drug ontology
        description: 'OncoKB is a precision oncology knowledge base and contains information about the effects and treatment implications of specific cancer gene alterations. It is developed and maintained by the Knowledge Systems group in the Marie Josée and Henry R. Kravis Center for Molecular Oncology at Memorial Sloan Kettering Cancer Center (MSK), in partnership with Quest Diagnostics and Watson for Genomics, IBM.',
        usage: 'https://oncokb.org/terms',
        url: 'https://oncokb.org',
        displayName: 'OncoKB',
    },
    ncit: {
        displayName: 'NCIt',
        sort: 2,
        longName: 'NCI Thesaurus',
        url: 'https://ncit.nci.nih.gov/ncitbrowser',
        usage: 'https://creativecommons.org/licenses/by/4.0',
        name: 'ncit',
        description: 'NCI Thesaurus (NCIt) provides reference terminology for many NCI and other systems. It covers vocabulary for clinical care, translational and basic research, and public information and administrative activities.',
    },
    iprkb: {
        name: 'iprkb',
        url: 'https://ipr.bcgsc.ca/knowledgebase/references',
        description: 'The predecessor to GraphKB',
        displayName: 'IPRKB',
    },
    hgnc: {
        name: 'hgnc',
        url: 'https://www.genenames.org/about',
        longName: 'HUGO Gene Nomenclature Committee',
        displayName: 'HGNC',
        usage: 'https://www.ebi.ac.uk/about/terms-of-use',
        sort: 2,
        description: `
            The HGNC is responsible for approving unique symbols and names for human loci, including
            protein coding genes, ncRNA genes and pseudogenes, to allow unambiguous scientific
            communication.`.replace(/\s+/, ' '),
    },
    fdaSrs: {
        displayName: 'FDA-SRS',
        sort: 3,
        name: 'fda srs',
        longName: 'FDA Substance Registration System',
        url: 'https://fdasis.nlm.nih.gov/srs',
        comment: 'https://www.fda.gov/ForIndustry/DataStandards/SubstanceRegistrationSystem-UniqueIngredientIdentifierUNII/default.htm',
        description: 'The overall purpose of the joint FDA/USP Substance Registration System (SRS) is to support health information technology initiatives by generating unique ingredient identifiers (UNIIs) for substances in drugs, biologics, foods, and devices. The UNII is a non- proprietary, free, unique, unambiguous, non semantic, alphanumeric identifier based on a substance’s molecular structure and/or descriptive information.',
    },
    ensembl: {
        displayName: 'Ensembl',
        name: 'ensembl', // avoid circular dependencies
        usage: 'https://uswest.ensembl.org/info/about/legal/disclaimer.html',
        url: 'https://uswest.ensembl.org',
        sort: 3,
        description: 'Ensembl is a genome browser for vertebrate genomes that supports research in comparative genomics, evolution, sequence variation and transcriptional regulation. Ensembl annotate genes, computes multiple alignments, predicts regulatory function and collects disease data. Ensembl tools include BLAST, BLAT, BioMart and the Variant Effect Predictor (VEP) for all supported species.',
    },
    drugbank: {
        displayName: 'DrugBank',
        sort: 0,
        name: 'drugbank',
        usage: 'https://creativecommons.org/licenses/by-nc/4.0/legalcode',
        url: 'https://www.drugbank.ca',
        description: 'The DrugBank database is a unique bioinformatics and cheminformatics resource that combines detailed drug data with comprehensive drug target information.',
    },
    gscTherapeuticOntology: {
        name: 'gsc therapeutic ontology',
        sort: 5,
        displayName: 'GSC-TO',
        description: 'Therapeutic ontology compiled and curated at the Genome Sciences Centre',
    },
    docm: {
        name: 'database of curated mutations',
        displayName: 'DoCM',
        description: 'DoCM, the Database of Curated Mutations, is a highly curated database of known, disease-causing mutations that provides easily explorable variant lists with direct links to source citations for easy verification.',
        url: 'http://www.docm.info',
        usage: 'http://www.docm.info/terms',
    },
    diseaseOntology: {
        displayName: 'Disease Ontology',
        sort: 1,
        name: 'disease ontology',
        longName: 'Human Disease Ontology',
        url: 'http://disease-ontology.org',
        license: 'https://creativecommons.org/publicdomain/zero/1.0',
        description: `
            The Disease Ontology has been developed as a standardized ontology for human disease
            with the purpose of providing the biomedical community with consistent, reusable and
            sustainable descriptions of human disease terms, phenotype characteristics and related
            medical vocabulary disease concepts through collaborative efforts of researchers at
            Northwestern University, Center for Genetic Medicine and the University of Maryland
            School of Medicine, Institute for Genome Sciences. The Disease Ontology semantically
            integrates disease and medical vocabularies through extensive cross mapping of DO
            terms to MeSH, ICD, NCI’s thesaurus, SNOMED and OMIM.`.replace(/\s+/, ' '),
    },
    dgidb: {
        name: 'dgidb',
        displayName: 'DGIdb',
        longName: 'Drug Gene Interaction Database',
        description: 'Mining the druggable genome for personalized medicine',
        usage: 'http://dgidb.org/faq',
    },
    cosmic: {
        url: 'https://cancer.sanger.ac.uk/cosmic',
        displayName: 'COSMIC',
        name: 'cosmic',
        usage: 'https://cancer.sanger.ac.uk/cosmic/license',
        description: 'COSMIC, the Catalogue Of Somatic Mutations In Cancer, is the world\'s largest and most comprehensive resource for exploring the impact of somatic mutations in human cancer.',
    },
    clinicalTrialsGov: {
        name: 'clinicaltrials.gov',
        url: 'https://clinicaltrials.gov',
        usage: 'https://clinicaltrials.gov/ct2/about-site/terms-conditions#Use',
        description: 'ClinicalTrials.gov is a database of privately and publicly funded clinical studies conducted around the world',
    },
    civic: {
        name: 'civic',
        url: 'https://civicdb.org',
        description: 'CIViC is an open access, open source, community-driven web resource for Clinical Interpretation of Variants in Cancer',
        usage: 'https://creativecommons.org/publicdomain/zero/1.0',
        displayName: 'CIViC',
    },
    chembl: {
        sort: 1,
        name: 'chembl',
        displayName: 'ChEMBL',
        description: 'ChEMBL is a manually curated database of bioactive molecules with drug-like properties. It brings together chemical, bioactivity and genomic data to aid the translation of genomic information into effective new drugs.',
        url: 'https://www.ebi.ac.uk/chembl',
        usage: 'https://creativecommons.org/licenses/by-sa/3.0',
    },
    cancerhotspots: {
        url: 'https://www.cancerhotspots.org',
        displayName: 'cancerhotspots.org',
        name: 'cancerhotspots.org',
        description: 'a resource for statistically significant mutations in cancer',
        license: 'https://opendatacommons.org/licenses/odbl/1.0',
    },
    cgi: {
        displayName: 'CGI',
        longName: 'cancer genome interpreter - Cancer Biomarkers database',
        name: 'cancer genome interpreter',
        url: 'https://www.cancergenomeinterpreter.org/biomarkers',
        description: 'The Cancer Biomarkers database is curated and maintained by several clinical and scientific experts in the field of precision oncology supported by the European Union’s Horizon 2020 funded project. This database is currently being integrated with knowledge databases of other institutions in a collaborative effort of the Global Alliance for Genomics and Health. The contribution of the community is encouraged and proposals of edition or comments about the information contained in this database can be given by contacting us here or by using the feedback icon located at the left of each entry of the table. The database follows the data model originally described by Dienstmann et al. This table provides a summary of the content of the database that can be interactively browsed. Additional information, including the genomic coordinates of the variants, can be accessed via the download feature. This database is licensed under a Creative Commons Public Domain Dedication (CC0 1.0 Universal). When referring to this database, please cite: Cancer Genome Interpreter Annotates The Biological And Clinical Relevance Of Tumor Alterations; doi: https://doi.org/10.1101/140475.',
        license: 'https://creativecommons.org/publicdomain/zero/1.0',
        citation: 'https://doi.org/10.1101/140475',
    },
    pubmed: {
        displayName: 'PubMed',
        name: 'pubmed',
        url: 'https://www.ncbi.nlm.nih.gov/pubmed',
        usage: 'https://www.ncbi.nlm.nih.gov/home/about/policies',
        description: `
            pubmed comprises more than 29 million citations for biomedical literature from medline,
            life science journals, and online books. citations may include links to full-text content
            from pubmed central and publisher web sites`.replace(/\s+/, ' '),
    },
    entrezGene: {
        name: 'entrez gene',
        sort: 1,
        url: 'https://www.ncbi.nlm.nih.gov/gene',
        usage: 'https://www.ncbi.nlm.nih.gov/home/about/policies',
        description: 'Gene integrates information from a wide range of species. A record may include nomenclature, Reference Sequences (RefSeqs), maps, pathways, variations, phenotypes, and links to genome-, phenotype-, and locus-specific resources worldwide.',
    },
    graphkb: {
        displayName: 'GraphKB',
        longName: 'Graph Knowledgebase',
        name: 'graphkb',
        url: 'https://graphkb.bcgsc.ca',
        sort: 0,
    },
    fdaApprovals: {
        name: 'fda approvals',
        url: 'https://www.fda.gov/drugs/resources-information-approved-drugs/hematologyoncology-cancer-approvals-safety-notifications',
        longName: 'FDA Hematology/Oncology (Cancer) Approvals & Safety Notifications',
        displayName: 'FDA Approvals',
    },
};

module.exports = sources;
