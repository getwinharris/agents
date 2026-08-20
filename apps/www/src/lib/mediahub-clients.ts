export type MediaHubClientLink = {
  label: string;
  href: string;
  kind: "website" | "social";
};

export type MediaHubSocialExample = {
  label: string;
  title: string;
  href: string;
};

export type MediaHubClient = {
  slug: string;
  name: string;
  category: string;
  summary: string;
  narrative: string;
  challenge: string;
  shipped: readonly string[];
  operating: string;
  logo: string;
  logoAlt: string;
  links: readonly MediaHubClientLink[];
  social?: {
    narrative: string;
    examples: readonly MediaHubSocialExample[];
  };
};

export const mediahubClients = [
  {
    slug: "gut-conference",
    name: "GUT Conference",
    category: "Clinical education + events",
    summary: "An owned expert platform connecting clinical education, consultations, events, selected social video, and grounded customer support.",
    narrative: "A professional knowledge and event platform for Dr. Praveen Jacob, built around the way a clinical educator publishes, runs classes, answers customer questions, and converts interest into consultations or registrations.",
    challenge: "Bring a professional profile, gut-health education, event operations, and an active social-video presence into one credible customer journey without requiring a heavyweight application stack.",
    shipped: [
      "Live professional profile, published references, consultation path, and events/classes journey",
      "Custom PHP administration for events, sections, speakers, sessions, venues, registrations, media, and support",
      "A first-party reel gallery that carries selected Instagram education into the website",
      "Google sign-in and a Gemini support agent grounded in CMS registration and certificate data",
    ],
    operating: "The live site leads with Dr. Praveen Jacob's clinical positioning, then connects visitors to consultations, events, public references, a curated reel library, and account-aware support. A compact owner CMS keeps event and content operations editable. Planned reminder and notification jobs are intentionally not presented here as delivered.",
    logo: "/brand/mediahub/gut-conference.png",
    logoAlt: "GUT Conference logo",
    links: [
      { label: "Live website", href: "https://gutconference.online/", kind: "website" },
      { label: "Instagram", href: "https://www.instagram.com/the.gut.expert/?hl=en", kind: "social" },
      { label: "LinkedIn", href: "https://www.linkedin.com/in/dr-praveen-jacob-61b350341/", kind: "social" },
      { label: "YouTube", href: "https://www.youtube.com/channel/UC0UAYYxQETPP6KJcCTHgP7w", kind: "social" },
      { label: "Facebook", href: "https://www.facebook.com/people/Dr-Praveen-Jacob/100063556307522/", kind: "social" },
    ],
    social: {
      narrative: "The social-to-site workflow is visible in the product itself: selected clinical reels are indexed in the CMS and presented as an on-site viewing experience, while the original profile remains one click away.",
      examples: [
        { label: "Instagram reel", title: "A selected clinical reel carried into the website gallery", href: "https://www.instagram.com/reel/DM-IqIwy8by/" },
        { label: "Live integration", title: "The on-site Shorts from @the.gut.expert collection", href: "https://gutconference.online/" },
      ],
    },
  },
  {
    slug: "sri-panchami-spiritual",
    name: "Sri Panchami Spiritual",
    category: "Spiritual commerce + consultations",
    summary: "A PHP/MySQL storefront and consultation platform for products, bookings, content, customer accounts, and owner operations.",
    narrative: "A complete shared-hosting commerce application for a spiritual-service brand, designed to make products, consultations, temple guidance, and post-purchase service operable from one system.",
    challenge: "Replace a collection of disconnected sales and enquiry steps with one fast, maintainable platform that works on standard PHP hosting and remains editable by the business owner.",
    shipped: [
      "Product catalogue, categories, cart, checkout, coupons, payments, orders, shipping, and tax workflows",
      "Consultant profiles, appointment requests, customer accounts, saved addresses, and reviews",
      "Markdown publishing for educational and help content plus a Panchami temple guide",
      "Owner administration for catalogue, appointments, content, media, email, integrations, and support",
    ],
    operating: "The live product uses server-rendered PHP with hosted MySQL, so the catalogue and business records stay editable without a frontend build pipeline. Customer journeys cover discovery, consultation, purchase, account history, and support.",
    logo: "/brand/mediahub/sri-panchami-spiritual.jpeg",
    logoAlt: "Sri Panchami Spiritual logo",
    links: [
      { label: "Live website", href: "https://sripanchamispiritual.com/", kind: "website" },
    ],
  },
  {
    slug: "auraedu",
    name: "AuraEdu",
    category: "Education + healthcare operations",
    summary: "Admissions, hospital services, therapy commerce, and owner operations brought together in one PHP/MySQL platform.",
    narrative: "A custom operating website for Aura Medical Institute of Electropathy and Hospital, connecting student recruitment, course information, clinical services, products, and day-to-day administration.",
    challenge: "Give prospective students, patients, and customers clear journeys while giving the institute one owner-operated system for admissions content, services, commerce, and publishing.",
    shipped: [
      "Course, eligibility, faculty, gallery, career-scope, and admissions journeys",
      "Hospital, therapy, and consultation discovery with enquiry and visit pathways",
      "Product catalogue, cart, checkout, customer accounts, orders, and reviews",
      "Blog/help publishing and administration for products, appointments, media, settings, and integrations",
    ],
    operating: "The live PHP/MySQL application combines public education and healthcare content with commerce and account workflows. A single admin surface owns the records and media used across those customer journeys.",
    logo: "/brand/mediahub/auraedu.svg",
    logoAlt: "AuraEdu brand mark",
    links: [
      { label: "Live website", href: "https://auraedu.co.in/", kind: "website" },
    ],
  },
  {
    slug: "nebo-lifestyle-clinic",
    name: "NEBO Lifestyle Clinic",
    category: "Managed WordPress + social",
    summary: "A managed WordPress wellness funnel supported by ongoing, education-led social content across the clinic's linked channels.",
    narrative: "A managed digital presence for a lifestyle clinic: the website establishes the wellness offer and the social channels keep health education, audience engagement, and clinic discovery active between visits.",
    challenge: "Turn a broad wellness practice into an understandable online journey, then maintain the WordPress surface and a regular social presence around the questions potential clients already ask.",
    shipped: [
      "Managed WordPress website, brand presentation, and production maintenance",
      "Service discovery and conversion paths for clinic enquiries",
      "Search metadata and a structured organisation presence on the website",
      "Ongoing educational social publishing across the linked Instagram, Facebook, and YouTube channels",
    ],
    operating: "The website remains the conversion and service-reference layer while social content handles recurring education and audience prompts. Public video examples cover metabolic questions and engagement-led self-check content rather than generic promotional filler.",
    logo: "/brand/mediahub/nebo-lifestyle-clinic.png",
    logoAlt: "NEBO Lifestyle Clinic logo",
    links: [
      { label: "Live website", href: "https://nebowellness.com/", kind: "website" },
      { label: "Instagram", href: "https://www.instagram.com/nebolifestyleclinic/", kind: "social" },
      { label: "Facebook", href: "https://www.facebook.com/nebolifestyleclinic", kind: "social" },
      { label: "YouTube", href: "https://www.youtube.com/@nebolifestyleclinic", kind: "social" },
    ],
    social: {
      narrative: "The managed channel mix uses short, topic-specific education and direct response prompts to turn everyday wellness questions into clinic awareness and conversations.",
      examples: [
        { label: "YouTube example", title: "Metabolic education: carbohydrates and weight gain", href: "https://www.youtube.com/watch?v=78iaJytAYq0" },
        { label: "YouTube example", title: "Engagement-led brain-fog self-check prompt", href: "https://www.youtube.com/watch?v=adNivAnS1lM" },
      ],
    },
  },
  {
    slug: "flexi-feet",
    name: "Flexi Feet",
    category: "Web product + managed content",
    summary: "A specialist-footwear website and operating system connecting education, appointments, owner CRM, publishing, social reuse, and grounded support.",
    narrative: "A customer-acquisition and service platform for Flexi Feet in Malaysia, pairing specialist product education with appointment booking, content publishing, support, and reusable social media.",
    challenge: "Explain a technical, assessment-led footwear service clearly enough for customers to choose the right next step, while reducing manual work around bookings, content, and common support questions.",
    shipped: [
      "Responsive service and product website with 3D scanning, conditions, fitting process, location, and FAQs",
      "Appointment intake with owner notifications and a compact CRM-style administration flow",
      "Blog CMS, media library, SEO publishing, and managed reels/shorts ordering",
      "Maya, a grounded website support experience for service questions, booking requests, and issue tickets",
    ],
    operating: "Website content moves from condition education and 3D assessment to an appointment request, while the owner CMS handles bookings, articles, media, and the social-video collection. The public site reuses managed short-form video as Flexi Stories and exposes support, ticket, bug-report, and feature-request actions.",
    logo: "/brand/mediahub/flexi-feet.png",
    logoAlt: "Flexi Feet logo",
    links: [
      { label: "Live website", href: "https://flexifeet.net/", kind: "website" },
      { label: "Instagram", href: "https://www.instagram.com/flexifeetmalaysia/", kind: "social" },
      { label: "Facebook", href: "https://www.facebook.com/flexifeetmalaysia", kind: "social" },
      { label: "YouTube", href: "https://www.youtube.com/@flexifeetmalaysia", kind: "social" },
      { label: "TikTok", href: "https://www.tiktok.com/@flexifeetmalaysia", kind: "social" },
    ],
    social: {
      narrative: "The channel work teaches around real customer concerns—pain, circulation, neuropathy, scanning, fit, and materials—then the website turns that attention into a fitting request and provides deeper reference content.",
      examples: [
        { label: "YouTube Short", title: "Custom insoles framed around an everyday foot-pain problem", href: "https://www.youtube.com/shorts/yiTjZajndfE" },
        { label: "YouTube Short", title: "Why diabetic footwear matters for neuropathy or poor circulation", href: "https://www.youtube.com/shorts/tuW4r1IArDY" },
      ],
    },
  },
  {
    slug: "indian-bariatrics",
    name: "Indian Bariatrics",
    category: "Established website stewardship + social",
    summary: "A live bariatric education and appointment platform maintained alongside doctor-led education and patient-story publishing.",
    narrative: "Long-term digital stewardship for an established bariatric practice: maintain the production healthcare knowledge and booking system while linked social channels carry timely expertise and patient journeys.",
    challenge: "Keep a broad, remotely data-backed production website useful across treatment education, clinical-team discovery, self-assessment, patient proof, and appointment booking.",
    shipped: [
      "Ongoing stewardship of the live treatment, diet, health-check, team, and patient-story website",
      "Production appointment catalogue and booking paths for the practice and its doctors",
      "BMI self-assessment plus educational content across obesity, metabolic health, and bariatric procedures",
      "Managed social publishing built around doctor-led explanations and patient transformation stories",
    ],
    operating: "The remotely data-backed live site acts as a durable patient-reference and appointment layer: treatment choices, team profiles, BMI assessment, success stories, and booking remain available in production. Linked social channels add current educational videos and patient experiences.",
    logo: "/brand/mediahub/indian-bariatrics.png",
    logoAlt: "Indian Bariatrics logo",
    links: [
      { label: "Live website", href: "https://indianbariatrics.com/", kind: "website" },
      { label: "Instagram", href: "https://www.instagram.com/bariatric_doctor/", kind: "social" },
      { label: "Facebook", href: "https://www.facebook.com/FightObesityAndDiabetes/", kind: "social" },
      { label: "YouTube", href: "https://www.youtube.com/@Bariatricdoctor", kind: "social" },
    ],
    social: {
      narrative: "The public video mix combines procedure education with patient journeys, giving prospective patients both clinical context and lived-experience stories while the legacy website remains the deeper reference layer.",
      examples: [
        { label: "YouTube example", title: "A patient story after gastric sleeve surgery", href: "https://www.youtube.com/watch?v=0PuY6ijC3IY" },
        { label: "YouTube example", title: "A weight-loss and infertility patient journey", href: "https://www.youtube.com/watch?v=03j1joYrp_E" },
      ],
    },
  },
  {
    slug: "happy-feet-erode",
    name: "Happy Feet Erode",
    category: "Managed social presence",
    summary: "A social-first content operation for specialist foot care, focused on practical education rather than a separate website build.",
    narrative: "A managed social presence for a foot-care centre that meets its audience where it already watches and shares health information, without claiming a website engagement that was not part of the work.",
    challenge: "Build consistent visibility and explain specialist foot-care topics in approachable short-form content while keeping the engagement intentionally social-only.",
    shipped: [
      "Managed Instagram, Facebook, and YouTube presence",
      "Short-form educational content around custom footwear, scanning, diabetic foot care, and specialist conditions",
      "A consistent brand voice across practical education and service discovery",
      "Channel-level customer contact and enquiry paths without a separate website claim",
    ],
    operating: "The content moves between accessible technology explainers and condition-specific education. Public examples cover personalised 3D scanning and transmetatarsal amputation, showing a useful specialist-content approach instead of repetitive sales posts.",
    logo: "/brand/mediahub/happy-feet-erode.jpg",
    logoAlt: "Happy Feet Foot Care Centre logo",
    links: [
      { label: "Instagram", href: "https://www.instagram.com/happyfeeterode/", kind: "social" },
      { label: "Facebook", href: "https://www.facebook.com/happyfeeterode/", kind: "social" },
      { label: "YouTube", href: "https://www.youtube.com/@happyfeeterode", kind: "social" },
    ],
    social: {
      narrative: "The channel strategy makes specialist expertise understandable through one-topic shorts, balancing technology-led service explanation with condition education.",
      examples: [
        { label: "YouTube Short", title: "Personalised footwear and insole design through 3D scanning", href: "https://www.youtube.com/watch?v=SvKGP3CGqkU" },
        { label: "YouTube Short", title: "A plain-language explanation of transmetatarsal amputation", href: "https://www.youtube.com/watch?v=Sd8Jwo28dQQ" },
      ],
    },
  },
] as const satisfies readonly MediaHubClient[];
