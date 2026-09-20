/**
 * Banner Reader — what we read from an image.
 *
 * ============================================================
 *  THIS FILE IS THE ONLY PLACE WHERE FIELDS ARE DEFINED.
 *
 *  To add a field, add ONE line to the right list below:
 *      f("instruments", "Instruments and software", "...", MULTI)
 *
 *  Everything else is generated from these lists:
 *    - the JSON schema sent to the model (strict Structured Outputs)
 *    - the field guide inside the prompt
 *    - the server-side validation of the answer
 *    - the field list the browser asks for at /api/banner/schema
 *
 *  The only other file to touch is public/banner/entry.html, and only
 *  to choose where the field sits on screen. A field that is not listed
 *  there is still shown, at the end of its section.
 * ============================================================
 */

export const ENTRY_TYPES = ["conference", "research", "exhibition", "card", "unknown"];

/** Types that carry their own field list. `card` and `unknown` carry none. */
export const TYPED = ["conference", "research", "exhibition"];

export const MULTI = true; // the field holds a list of lines instead of one line

/** f(key, label, hint, multi?) — `hint` is what the model is told to look for. */
const f = (key, label, hint, multi = false) => ({ key, label, hint, multi });

export const TYPE_LABELS = {
  conference: "International conference banner",
  research: "Research poster",
  exhibition: "Exhibition panel",
  card: "Business card",
  unknown: "Unknown",
};

export const TYPE_FIELDS = {
  // ---- International conference banner / call for papers ------------------
  conference: [
    f("conferenceName", "Conference name", "the full official name as printed"),
    f("acronym", "Acronym", "short form printed on the banner, e.g. ICEEDP 2027"),
    f("edition", "Edition", "which occurrence, e.g. 9th"),
    f("dates", "Dates", "the conference dates exactly as printed"),
    f("location", "Location", "city and country"),
    f("venue", "Venue", "name of the building or campus"),
    f("organisers", "Organisers", "organised / co-organised / supported by", MULTI),
    f("scope", "Aim and scope", "the stated purpose of the conference"),
    f("topics", "Topics", "one line per topic in the topic list", MULTI),
    f("keynotes", "Keynote speakers", "one line per speaker: name, affiliation, talk title", MULTI),
    f("deadlines", "Important dates", "one line per deadline, label and date as printed", MULTI),
    f("fees", "Registration fees", "one line per fee, with currency as printed", MULTI),
    f("colocatedEvents", "Co-located events", "workshops, tutorials, satellite events", MULTI),
    f("officialUrl", "Official URL", "the website address printed on the image"),
  ],

  // ---- Research poster ----------------------------------------------------
  research: [
    f("researchTitle", "Title", "the poster title"),
    f("authors", "Authors", "one line per author, in the printed order", MULTI),
    f("affiliations", "Affiliations", "one line per institution", MULTI),
    f("researchQuestion", "Research question", "the problem or objective stated on the poster"),
    f("methods", "Methods", "how the work was carried out"),
    f("materials", "Materials and samples", "what was measured, tested or surveyed"),
    f("keyResults", "Key results", "one line per finding, numbers with their units", MULTI),
    f("conclusion", "Conclusion", "the stated conclusion"),
    f("limitations", "Limitations and future work", "stated limits, open questions, next steps"),
    f("keywords", "Keywords", "one line per keyword", MULTI),
    f("funding", "Funding and acknowledgements", "grant names and numbers, only if legible"),
    f("contactInfo", "Contact", "e-mail, ORCID or address printed on the poster"),
    f("figureNotes", "Figures and tables", "one line per figure or table: its caption", MULTI),
  ],

  // ---- Company exhibition panel ------------------------------------------
  exhibition: [
    f("companyName", "Company", "the company name as printed, in every script shown"),
    f("offices", "Offices", "address, city or country of the company", MULTI),
    f("productName", "Product", "product name and model number"),
    f("whatItDoes", "What it does", "the stated function of the product"),
    f("purpose", "Purpose", "the problem the product is presented as solving"),
    f("performance", "Specifications", "one line per specification, numbers with their units", MULTI),
    f("achievements", "Benefits", "one line per stated outcome for the customer", MULTI),
    f("novelty", "Novelty", "what is claimed to be new, including patent numbers"),
    f("applications", "Applications", "one line per stated field of use", MULTI),
    f("technologies", "Technologies", "one line per technical element named", MULTI),
    f("deployments", "Track record", "one line per customer, site or number of installations", MULTI),
    f("certifications", "Certifications", "one line per standard or certificate", MULTI),
    f("priceAvailability", "Price and availability", "price, lead time, warranty as printed"),
    f("officialUrl", "Official URL", "the website address printed on the image"),
  ],
};

/** A person read from a business card or a contact block. */
export const CONTACT_FIELDS = [
  f("nameOriginal", "Name (original script)", "the name as printed in its own script"),
  f("nameLatin", "Name (Latin script)", "the Latin transcription, only if printed"),
  f("jobTitle", "Job title", "role as printed"),
  f("department", "Department", "division or department as printed"),
  f("organisation", "Organisation", "company or institution as printed"),
  f("address", "Address", "postal address as printed"),
  f("phone", "Phone", "landline or switchboard number"),
  f("mobile", "Mobile", "mobile number"),
  f("email", "E-mail", "e-mail address"),
  f("web", "Web", "website address"),
  f("social", "Social / profiles", "one line per profile: LinkedIn, X, ResearchGate, ORCID", MULTI),
];

/* ------------------------------------------------------------------------ *
 * Everything below is generated. Adding a field above needs no change here. *
 * ------------------------------------------------------------------------ */

/** The { value, sourceText, confidence } triple, as a strict JSON schema. */
function fieldSchema(field) {
  const value = field.multi
    ? { type: ["array", "null"], items: { type: "string" }, description: `${field.hint} — one entry per line, copied verbatim` }
    : { type: ["string", "null"], description: `${field.hint} — copied verbatim, or null if not legible` };

  return {
    type: "object",
    description: field.label,
    properties: {
      value,
      sourceText: {
        type: ["string", "null"],
        description: "The exact characters as they appear in the image. null if the value could not be read.",
      },
      confidence: { type: "number", description: "0.0 to 1.0. Use 0 when the value is null." },
    },
    required: ["value", "sourceText", "confidence"],
    additionalProperties: false,
  };
}

function objectSchema(fields, { nullable = false, description = "" } = {}) {
  const properties = {};
  for (const field of fields) properties[field.key] = fieldSchema(field);
  return {
    type: nullable ? ["object", "null"] : "object",
    description,
    properties,
    required: fields.map((field) => field.key),
    additionalProperties: false,
  };
}

/**
 * The full response schema.
 * strict mode forbids anyOf at the root, so every type is present and the
 * ones that do not apply are null.
 */
export function buildCaptureSchema() {
  const properties = {
    type: { type: "string", enum: ENTRY_TYPES, description: "What the image mainly shows" },
    typeConfidence: { type: "number", description: "0.0 to 1.0" },
    language: { type: ["string", "null"], description: "Language(s) of the printed text, e.g. en, ja, en+ja" },
    title: { type: ["string", "null"], description: "Headline for this entry, copied from the image" },
    org: {
      type: ["string", "null"],
      description:
        "Main organisation, copied from the image: the company on a panel or card, the organiser of a conference, the first affiliation on a poster",
    },
    summary: { type: ["string", "null"], description: "One or two sentences, using only what the image shows" },
    tags: { type: ["array", "null"], items: { type: "string" }, description: "Keywords taken from the image" },
    urls: { type: ["array", "null"], items: { type: "string" }, description: "Web addresses printed as text. Never from a QR code." },
    unreadable: {
      type: ["array", "null"],
      items: { type: "string" },
      description: "One line per region that could not be read (blurred, cropped, too small)",
    },
    contacts: {
      type: ["array", "null"],
      items: objectSchema(CONTACT_FIELDS, { description: "A person read from a business card or contact block" }),
      description: "People found on business cards or contact blocks. Empty list if none.",
    },
  };

  for (const type of TYPED) {
    properties[type] = objectSchema(TYPE_FIELDS[type], {
      nullable: true,
      description: `Fields for ${TYPE_LABELS[type]}. null unless type is "${type}".`,
    });
  }

  return {
    type: "object",
    properties,
    required: [...Object.keys(properties)],
    additionalProperties: false,
  };
}

/** The field list, written out for the prompt. */
export function buildFieldGuide() {
  const lines = [];
  for (const type of TYPED) {
    lines.push(`${type} (${TYPE_LABELS[type]}):`);
    for (const field of TYPE_FIELDS[type]) {
      lines.push(`  - ${field.key}: ${field.hint}${field.multi ? " (list)" : ""}`);
    }
  }
  lines.push("contacts[] (business cards, any type):");
  for (const field of CONTACT_FIELDS) {
    lines.push(`  - ${field.key}: ${field.hint}${field.multi ? " (list)" : ""}`);
  }
  return lines.join("\n");
}

/** What the browser needs in order to render an entry: keys, labels, order. */
export function buildFieldManifest() {
  const types = {};
  for (const type of TYPED) {
    types[type] = TYPE_FIELDS[type].map(({ key, label, multi }) => ({ key, label, multi }));
  }
  return {
    types,
    typeLabels: TYPE_LABELS,
    contacts: CONTACT_FIELDS.map(({ key, label, multi }) => ({ key, label, multi })),
  };
}
