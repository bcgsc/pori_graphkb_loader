const sources = {
    PMC4232638: {
        description: 'Statements derived from the supplementary files accompanying this publication',
        displayName: 'PMC4232638-supp',
        name: 'PMC4232638-supp',
        url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4232638/bin/13059_2014_484_MOESM2_ESM.xlsx',
    },
    PMC4468049: {
        description: 'Statements derived from the supplementary files accompanying this publication',
        displayName: 'PMC4468049-supp',
        name: 'PMC4468049-supp',
        url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4468049/bin/NIHMS632238-supplement-2.xlsx',
    },
    amp: {
        displayName: 'AMP',
        longName: 'association for molecular pathology',
        name: 'amp',
        url: 'https://www.amp.org',
    },
    asco: {
        displayName: 'ASCO',
        longName: 'American Society of Clinical Oncology',
        name: 'asco',
        url: 'https://meetinglibrary.asco.org',
    },
    cancerhotspots: {
        description: 'a resource for statistically significant mutations in cancer',
        displayName: 'cancerhotspots.org',
        license: 'https://opendatacommons.org/licenses/odbl/1.0',
        name: 'cancerhotspots.org',
        url: 'https://www.cancerhotspots.org',
    },
    cgi: {
        citation: 'https://doi.org/10.1101/140475',
        description: 'The Cancer Biomarkers database is curated and maintained by several clinical and scientific experts in the field of precision oncology supported by the European Union’s Horizon 2020 funded project. This database is currently being integrated with knowledge databases of other institutions in a collaborative effort of the Global Alliance for Genomics and Health. The contribution of the community is encouraged and proposals of edition or comments about the information contained in this database can be given by contacting us here or by using the feedback icon located at the left of each entry of the table. The database follows the data model originally described by Dienstmann et al. This table provides a summary of the content of the database that can be interactively browsed. Additional information, including the genomic coordinates of the variants, can be accessed via the download feature. This database is licensed under a Creative Commons Public Domain Dedication (CC0 1.0 Universal). When referring to this database, please cite: Cancer Genome Interpreter Annotates The Biological And Clinical Relevance Of Tumor Alterations; doi: https://doi.org/10.1101/140475.',
        displayName: 'CGI',
        license: 'https://creativecommons.org/publicdomain/zero/1.0',
        licenseType: 'CC BY-NC 4.0',
        longName: 'cancer genome interpreter - Cancer Biomarkers database',
        name: 'cancer genome interpreter',
        url: 'https://www.cancergenomeinterpreter.org/biomarkers',
    },
    cgl: {
        description: 'The CGL is mandated to provide molecular genetic diagnostics and paraffin FISH testing for all cancer patients in British Columbia',
        displayName: 'CGL',
        longName: 'BC Cancer Genetics and Genomics Laboratory',
        name: 'cgl',
        url: 'https://www.cancergenomeinterpreter.org',
    },
    chembl: {
        description: 'ChEMBL is a manually curated database of bioactive molecules with drug-like properties. It brings together chemical, bioactivity and genomic data to aid the translation of genomic information into effective new drugs.',
        displayName: 'ChEMBL',
        licenseType: 'CC BY-SA 3.0',
        name: 'chembl',
        sort: 1,
        url: 'https://www.ebi.ac.uk/chembl',
        usage: 'https://creativecommons.org/licenses/by-sa/3.0',
    },
    civic: {
        description: 'CIViC is an open access, open source, community-driven web resource for Clinical Interpretation of Variants in Cancer',
        displayName: 'CIViC',
        licenseType: 'CC0 1.0',
        name: 'civic',
        sort: 4,
        url: 'https://civicdb.org',
        usage: 'https://creativecommons.org/publicdomain/zero/1.0',
    },
    clinicalTrialsGov: {
        description: 'ClinicalTrials.gov is a database of privately and publicly funded clinical studies conducted around the world',
        name: 'clinicaltrials.gov',
        url: 'https://clinicaltrials.gov',
        usage: 'https://clinicaltrials.gov/ct2/about-site/terms-conditions#Use',
    },
    cosmic: {
        description: 'COSMIC, the Catalogue Of Somatic Mutations In Cancer, is the world\'s largest and most comprehensive resource for exploring the impact of somatic mutations in human cancer.',
        displayName: 'COSMIC',
        name: 'cosmic',
        url: 'https://cancer.sanger.ac.uk/cosmic',
        usage: 'https://cancer.sanger.ac.uk/cosmic/license',
    },
    cpic: {
        citation: 'https://cpicpgx.org/publications',
        description: 'the clinical pharmacogenetics implementation consortium (cpic®) is an international consortium of individual volunteers and a small dedicated staff who are interested in facilitating use of pharmacogenetic tests for patient care.​ cpic guidelines are indexed in pubmed as clinical guidelines, endorsed by ashp and ascpt, and referenced in clingen and pharmgkb',
        displayName: 'CPIC',
        licenseType: 'CC0 1.0 Universal',
        longName: 'clinical pharmacogenetics implementation consortium',
        name: 'cpic',
        url: 'https://cpicpgx.org',
        usage: 'https://cpicpgx.org/license',
    },
    dbSnp: {
        description: 'dbSNP contains human single nucleotide variations, microsatellites, and small-scale insertions and deletions along with publication, population frequency, molecular consequence, and genomic and RefSeq mapping information for both common variations and clinical mutations.',
        displayName: 'dbSNP',
        name: 'dbsnp',
        url: 'https://www.ncbi.nlm.nih.gov/snp',
        usage: 'https://www.ncbi.nlm.nih.gov/home/about/policies',
    },
    dgidb: {
        citation: 'https://doi.org/10.1093/nar/gkaa1084',
        description: 'Mining the druggable genome for personalized medicine',
        displayName: 'DGIdb',
        longName: 'Drug Gene Interaction Database',
        name: 'dgidb',
        usage: 'http://dgidb.org/faq',
    },
    diseaseOntology: {
        description: 'The Disease Ontology has been developed as a standardized ontology for human disease with the purpose of providing the biomedical community with consistent, reusable and sustainable descriptions of human disease terms, phenotype characteristics and related medical vocabulary disease concepts through collaborative efforts of researchers at Northwestern University, Center for Genetic Medicine and the University of Maryland School of Medicine, Institute for Genome Sciences. The Disease Ontology semantically integrates disease and medical vocabularies through extensive cross mapping of DO terms to MeSH, ICD, NCI’s thesaurus, SNOMED and OMIM.',
        displayName: 'Disease Ontology',
        license: 'https://creativecommons.org/publicdomain/zero/1.0',
        licenseType: 'CC0 1.0 Universal',
        longName: 'Human Disease Ontology',
        name: 'disease ontology',
        sort: 1,
        url: 'http://disease-ontology.org',
    },
    docm: {
        description: 'DoCM, the Database of Curated Mutations, is a highly curated database of known, disease-causing mutations that provides easily explorable variant lists with direct links to source citations for easy verification.',
        displayName: 'DoCM',
        licenseType: 'CC BY 4.0',
        name: 'database of curated mutations',
        url: 'http://www.docm.info',
        usage: 'http://www.docm.info/terms',
    },
    drugbank: {
        description: 'The DrugBank database is a unique bioinformatics and cheminformatics resource that combines detailed drug data with comprehensive drug target information.',
        displayName: 'DrugBank',
        licenseType: 'Attribution-NonCommercial 4.0 International',
        name: 'drugbank',
        sort: 0,
        url: 'https://www.drugbank.ca',
        usage: 'https://creativecommons.org/licenses/by-nc/4.0/legalcode',
    },
    ensembl: {
        description: 'Ensembl is a genome browser for vertebrate genomes that supports research in comparative genomics, evolution, sequence variation and transcriptional regulation. Ensembl annotate genes, computes multiple alignments, predicts regulatory function and collects disease data. Ensembl tools include BLAST, BLAT, BioMart and the Variant Effect Predictor (VEP) for all supported species.',
        displayName: 'Ensembl',
        name: 'ensembl',
        sort: 3,
        url: 'https://uswest.ensembl.org',
        usage: 'https://uswest.ensembl.org/info/about/legal/disclaimer.html',
    },
    entrezGene: {
        description: 'Gene integrates information from a wide range of species. A record may include nomenclature, Reference Sequences (RefSeqs), maps, pathways, variations, phenotypes, and links to genome-, phenotype-, and locus-specific resources worldwide.',
        name: 'entrez gene',
        sort: 1,
        url: 'https://www.ncbi.nlm.nih.gov/gene',
        usage: 'https://www.ncbi.nlm.nih.gov/home/about/policies',
    },
    fdaApprovals: {
        displayName: 'FDA Approvals',
        longName: 'FDA Hematology/Oncology (Cancer) Approvals & Safety Notifications',
        name: 'fda approvals',
        url: 'https://www.fda.gov/drugs/resources-information-approved-drugs/hematologyoncology-cancer-approvals-safety-notifications',
    },
    fdaSrs: {
        comment: 'https://www.fda.gov/ForIndustry/DataStandards/SubstanceRegistrationSystem-UniqueIngredientIdentifierUNII/default.htm',
        description: 'The overall purpose of the joint FDA/USP Substance Registration System (SRS) is to support health information technology initiatives by generating unique ingredient identifiers (UNIIs) for substances in drugs, biologics, foods, and devices. The UNII is a non- proprietary, free, unique, unambiguous, non semantic, alphanumeric identifier based on a substance’s molecular structure and/or descriptive information.',
        displayName: 'FDA-SRS',
        longName: 'FDA Substance Registration System',
        name: 'fda srs',
        sort: 3,
        url: 'https://fdasis.nlm.nih.gov/srs',
    },
    graphkb: {
        displayName: 'GraphKB',
        longName: 'Graph Knowledgebase',
        name: 'graphkb',
        sort: 0,
        url: 'https://graphkb.bcgsc.ca',
    },
    gscTherapeuticOntology: {
        description: 'Therapeutic ontology compiled and curated at the Genome Sciences Centre',
        displayName: 'GSC-TO',
        name: 'gsc therapeutic ontology',
        sort: 5,
    },
    hgnc: {
        description: 'The HGNC is responsible for approving unique symbols and names for human loci, including protein coding genes, ncRNA genes and pseudogenes, to allow unambiguous scientific communication.',
        displayName: 'HGNC',
        longName: 'HUGO Gene Nomenclature Committee',
        name: 'hgnc',
        sort: 2,
        url: 'https://www.genenames.org/about',
        usage: 'https://www.ebi.ac.uk/about/terms-of-use',
    },
    ipr: {
        description: 'IPR (Integrated Pipeline Reports) is the reporting module used in the Platform for Oncogenomic Reporting and Interpretation (PORI)',
        displayName: 'IPR',
        longName: 'Integrated Pipeline Reports (IPR) Aggregated Evidence Levels',
        name: 'ipr',
        url: 'https://ipr.bcgsc.ca',
    },
    iprkb: {
        description: 'The predecessor to GraphKB',
        displayName: 'IPRKB',
        name: 'iprkb',
        url: 'https://ipr.bcgsc.ca/knowledgebase/references',
    },
    moa: {
        citation: 'https://doi.org/10.1038/s43018-021-00243-3',
        description: 'A collection of putative alteration/action relationships identified in clinical, preclinical, and inferential studies.',
        displayName: 'MOAlmanac',
        licenseType: 'GPL-2.0',
        longName: 'Molecular Oncology Almanac',
        name: 'moa',
        url: 'https://moalmanac.org',
        usage: 'https://moalmanac.org/terms',
    },
    ncit: {
        description: 'NCI Thesaurus (NCIt) provides reference terminology for many NCI and other systems. It covers vocabulary for clinical care, translational and basic research, and public information and administrative activities.',
        displayName: 'NCIt',
        licenseType: 'CC BY 4.0',
        longName: 'NCI Thesaurus',
        name: 'ncit',
        sort: 2,
        url: 'https://ncit.nci.nih.gov/ncitbrowser',
        usage: 'https://evs.nci.nih.gov/ftp1/NCI_Thesaurus/ThesaurusTermsofUse.pdf',
    },
    oncokb: {
        description: 'OncoKB is a precision oncology knowledge base and contains information about the effects and treatment implications of specific cancer gene alterations. It is developed and maintained by the Knowledge Systems group in the Marie Josée and Henry R. Kravis Center for Molecular Oncology at Memorial Sloan Kettering Cancer Center (MSK), in partnership with Quest Diagnostics and Watson for Genomics, IBM.',
        displayName: 'OncoKB',
        name: 'oncokb',
        sort: 99999,
        url: 'https://oncokb.org',
        usage: 'https://oncokb.org/terms',
    },
    oncotree: {
        displayName: 'OncoTree',
        name: 'oncotree',
        sort: 0,
        url: 'http://oncotree.mskcc.org',
    },
    pubmed: {
        description: 'pubmed comprises more than 29 million citations for biomedical literature from medline, life science journals, and online books. citations may include links to full-text content from pubmed central and publisher web sites',
        displayName: 'PubMed',
        name: 'pubmed',
        url: 'https://www.ncbi.nlm.nih.gov/pubmed',
        usage: 'https://www.ncbi.nlm.nih.gov/home/about/policies',
    },
    refseq: {
        description: 'A comprehensive, integrated, non-redundant, well-annotated set of reference sequences including genomic, transcript, and protein.',
        displayName: 'RefSeq',
        longName: 'RefSeq: NCBI Reference Sequence Database',
        name: 'refseq',
        url: 'https://www.ncbi.nlm.nih.gov/refseq',
        usage: 'https://www.ncbi.nlm.nih.gov/home/about/policies',
    },
    sequenceOntology: {
        description: 'The Sequence Ontology is a set of terms and relationships used to describe the features and attributes of biological sequence. SO includes different kinds of features which can be located on the sequence.',
        name: 'sequence ontology',
        url: 'http://www.sequenceontology.org',
        usage: 'http://www.sequenceontology.org/?page_id=269',
    },
    uberon: {
        comment: 'https://github.com/obophenotype/uberon/issues/1139',
        description: 'Uberon is an integrated cross-species ontology covering anatomical structures in animals.',
        displayName: 'Uberon',
        name: 'uberon',
        url: 'http://uberon.github.io',
        usage: 'http://obofoundry.github.io/principles/fp-001-open.html',
    },
    vario: {
        description: 'Variation Ontology, VariO, is an ontology for standardized, systematic description of effects, consequences and mechanisms of variations. VariO allows unambiguous description of variation effects as well as computerized analyses over databases utilizing the ontology for annotation. VariO is a position specific ontology that can be used to describe effects of variations on DNA, RNA and/or protein level, whatever is appropriate.',
        name: 'vario',
        url: 'http://variationontology.org',
        usage: 'http://variationontology.org/citing.shtml',
    },
    vicc: {
        description: 'The Variant Interpretation for Cancer Consortium (VICC) is a Driver Project of the Global Alliance for Genomics and Health. Our mission is to standardize the curation, representation, and interpretation of clinically-relevant evidence associated with genomic variation in cancers.',
        displayName: 'VICC',
        name: 'Variant Interpretation for Cancer Consortium',
        url: 'https://cancervariants.org',
    },
};

module.exports = sources;
