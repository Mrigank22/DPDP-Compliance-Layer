// services/control-plane/internal/services/ai_frameworks.go

package services

import "github.com/datasentinel/control-plane/internal/models"

// frameworkCatalog is the reference library of governance frameworks and their
// controls used to assess each AI system. It is static reference data; tenant
// answers are stored separately in ai_assessments.
var frameworkCatalog = []models.Framework{
	{
		ID:          models.FrameworkNISTAIRMF,
		Name:        "NIST AI RMF",
		Description: "NIST AI Risk Management Framework (Govern, Map, Measure, Manage).",
		Controls: []models.FrameworkControl{
			{ID: "nist_govern_1_1", Ref: "GOVERN 1.1", Category: "Govern", Title: "Legal & regulatory requirements", Description: "Legal and regulatory requirements involving AI are understood, managed and documented."},
			{ID: "nist_govern_2_1", Ref: "GOVERN 2.1", Category: "Govern", Title: "Roles & responsibilities", Description: "Roles, responsibilities and lines of communication for AI risk are documented."},
			{ID: "nist_govern_4_1", Ref: "GOVERN 4.1", Category: "Govern", Title: "Risk-management policy", Description: "Organizational policies and practices for AI risk management are in place."},
			{ID: "nist_map_1_1", Ref: "MAP 1.1", Category: "Map", Title: "Context & intended purpose", Description: "The AI system's context, intended purpose and stakeholders are documented."},
			{ID: "nist_map_2_3", Ref: "MAP 2.3", Category: "Map", Title: "Limitations documented", Description: "Scientific and technical limitations and assumptions are documented."},
			{ID: "nist_measure_2_1", Ref: "MEASURE 2.1", Category: "Measure", Title: "Evaluation & metrics", Description: "Test sets, metrics and evaluations of the AI system are documented and performed."},
			{ID: "nist_measure_2_7", Ref: "MEASURE 2.7", Category: "Measure", Title: "Security & resilience", Description: "AI system security and resilience are evaluated and documented."},
			{ID: "nist_manage_1_1", Ref: "MANAGE 1.1", Category: "Manage", Title: "Risk response", Description: "AI risks are prioritized, responded to and managed."},
			{ID: "nist_manage_4_1", Ref: "MANAGE 4.1", Category: "Manage", Title: "Post-deployment monitoring", Description: "Post-deployment monitoring and incident response mechanisms are in place."},
		},
	},
	{
		ID:          models.FrameworkEUAIAct,
		Name:        "EU AI Act",
		Description: "Obligations for providers of high-risk AI systems (Art. 8–17, 50).",
		Controls: []models.FrameworkControl{
			{ID: "eu_art_9", Ref: "Art. 9", Category: "Risk management", Title: "Risk management system", Description: "A risk management system is established, implemented and maintained across the lifecycle."},
			{ID: "eu_art_10", Ref: "Art. 10", Category: "Data governance", Title: "Data & data governance", Description: "Training, validation and testing data are relevant, representative and governed."},
			{ID: "eu_art_11", Ref: "Art. 11", Category: "Documentation", Title: "Technical documentation", Description: "Technical documentation demonstrating compliance is drawn up and kept up to date."},
			{ID: "eu_art_12", Ref: "Art. 12", Category: "Record-keeping", Title: "Record-keeping & logging", Description: "The system automatically records events (logs) over its lifetime."},
			{ID: "eu_art_13", Ref: "Art. 13", Category: "Transparency", Title: "Transparency to deployers", Description: "Operation is transparent enough for deployers to interpret output and use it appropriately."},
			{ID: "eu_art_14", Ref: "Art. 14", Category: "Human oversight", Title: "Human oversight", Description: "The system is designed to be effectively overseen by humans."},
			{ID: "eu_art_15", Ref: "Art. 15", Category: "Robustness", Title: "Accuracy, robustness & cybersecurity", Description: "Appropriate levels of accuracy, robustness and cybersecurity are achieved."},
			{ID: "eu_art_17", Ref: "Art. 17", Category: "Quality", Title: "Quality management system", Description: "A quality management system ensures ongoing compliance."},
			{ID: "eu_art_50", Ref: "Art. 50", Category: "Transparency", Title: "User-facing AI disclosure", Description: "Users are informed when they interact with an AI system or AI-generated content."},
		},
	},
	{
		ID:          models.FrameworkISO42001,
		Name:        "ISO/IEC 42001",
		Description: "AI management system requirements and Annex A controls.",
		Controls: []models.FrameworkControl{
			{ID: "iso_6_1", Ref: "6.1", Category: "Planning", Title: "Risks & opportunities", Description: "Actions to address AI risks and opportunities are planned."},
			{ID: "iso_8_2", Ref: "8.2", Category: "Operation", Title: "AI risk assessment", Description: "AI risk assessments are performed at planned intervals."},
			{ID: "iso_8_3", Ref: "8.3", Category: "Operation", Title: "AI risk treatment", Description: "An AI risk treatment plan is implemented."},
			{ID: "iso_8_4", Ref: "8.4", Category: "Operation", Title: "AI system impact assessment", Description: "Impacts of the AI system on individuals and society are assessed."},
			{ID: "iso_9_1", Ref: "9.1", Category: "Evaluation", Title: "Monitoring & measurement", Description: "Performance and effectiveness of the AI management system are monitored."},
			{ID: "iso_a_5", Ref: "A.5", Category: "Controls", Title: "AI policy", Description: "Policies for the responsible development and use of AI are defined."},
			{ID: "iso_a_6", Ref: "A.6", Category: "Controls", Title: "Internal organization", Description: "Roles, responsibilities and resources for AI are allocated."},
		},
	},
	{
		ID:          models.FrameworkDPDP,
		Name:        "DPDP (India)",
		Description: "Digital Personal Data Protection Act intersection with AI processing.",
		Controls: []models.FrameworkControl{
			{ID: "dpdp_lawful_basis", Ref: "Lawful basis", Category: "Lawful processing", Title: "Consent / legitimate use", Description: "A valid lawful basis (consent or legitimate use) exists for personal data the AI processes."},
			{ID: "dpdp_purpose", Ref: "Purpose limitation", Category: "Lawful processing", Title: "Purpose limitation", Description: "Personal data is used only for the purpose notified to the data principal."},
			{ID: "dpdp_minimisation", Ref: "Data minimisation", Category: "Data", Title: "Data minimisation", Description: "Only personal data necessary for the AI's purpose is processed."},
			{ID: "dpdp_rights", Ref: "Principal rights", Category: "Rights", Title: "Data-principal rights", Description: "Access, correction and erasure rights are honoured for AI-processed data."},
			{ID: "dpdp_security", Ref: "Security safeguards", Category: "Security", Title: "Security safeguards", Description: "Reasonable security safeguards protect personal data used by the AI."},
			{ID: "dpdp_retention", Ref: "Retention", Category: "Retention", Title: "Retention limitation", Description: "Personal data is erased once the purpose is served, subject to legal retention."},
			{ID: "dpdp_transfer", Ref: "Cross-border", Category: "Transfers", Title: "Cross-border transfer", Description: "Any transfer of personal data outside India observes applicable restrictions."},
		},
	},
}

// frameworkByID indexes the catalog for quick lookup.
var frameworkByID = func() map[string]models.Framework {
	m := make(map[string]models.Framework, len(frameworkCatalog))
	for _, f := range frameworkCatalog {
		m[f.ID] = f
	}
	return m
}()

// controlIndexByFramework maps framework id -> set of valid control ids.
var controlIndexByFramework = func() map[string]map[string]bool {
	out := make(map[string]map[string]bool, len(frameworkCatalog))
	for _, f := range frameworkCatalog {
		set := make(map[string]bool, len(f.Controls))
		for _, c := range f.Controls {
			set[c.ID] = true
		}
		out[f.ID] = set
	}
	return out
}()

func frameworkExists(id string) bool {
	_, ok := frameworkByID[id]
	return ok
}
