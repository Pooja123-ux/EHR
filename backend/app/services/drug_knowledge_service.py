"""
Drug knowledge service with ATC-class-level interaction rules.

Provides interaction evidence based on drug classes/mechanisms:
- ATC (Anatomical Therapeutic Chemical) classification
- Class-level interaction rules (e.g., NSAID + Anticoagulant)
- Mechanism-based reasoning
"""
from __future__ import annotations

from typing import Optional


# Drug class definitions with common members
# Format: class_name -> { drugs: [list], level: str, desc: str, alt: str }
# Note: This is a simplified example. A real implementation would use
# the full ATC classification system from WHO.
DRUG_CLASSES: dict[str, dict] = {
    "anticoagulant": {
        "drugs": [
            "warfarin", "acenocoumarol", "phenprocoumon", "dicoumarol",
            "heparin", "low molecular weight heparin", "enoxaparin", "dalteparin",
            "tinzaparin", "fondaparinux", "dabigatran", "apixaban", "rivaroxaban",
            "edoxaban", "betrixaban", "argatroban", "bivalirudin", "fondaparinux",
        ],
        "level": "High Risk",
        "mechanism": "Anticoagulants increase bleeding risk when combined with other anticoagulants or antiplatelet agents",
        "desc": "Combining anticoagulants with other blood-thinning agents significantly increases the risk of bleeding.",
        "alt": "Consult your doctor before combining anticoagulants with other medications.",
    },
    "antiplatelet": {
        "drugs": [
            "aspirin", "clopidogrel", "ticagrelor", "prasugrel",
            "dipyridamole", "cilostazol", "ticlopidine",
        ],
        "level": "Moderate",
        "mechanism": "Antiplatelet agents increase bleeding risk when combined with anticoagulants or other antiplatelets",
        "desc": "Combining antiplatelet agents with anticoagulants increases the risk of bleeding.",
        "alt": "Monitor for signs of bleeding and consult your doctor.",
    },
    "nsaid": {
        "drugs": [
            "ibuprofen", "naproxen", "diclofenac", "indomethacin",
            "piroxicam", "tenoxicam", "meloxicam", "celecoxib", "etoricoxib",
            "rofecoxib", "valdecoxib", "lumiracoxib", "aceclofenac",
            "nabumetone", "etodolac", "ketorolac", "ketoprofen",
            "flurbiprofen", "oxaprozin", "sulindac", "tolmetin",
            "mefenamic acid", "meclofenamate", "flufenamic acid",
            "tolfenamic acid", "dexibuprofen", "dexketoprofen",
            "nepafenac", "bromfenac", "diclofenac epolamine",
        ],
        "level": "Moderate",
        "mechanism": "NSAIDs can increase bleeding risk with anticoagulants, reduce renal function with ACE inhibitors/ARBs, and increase nephrotoxicity with cyclosporine",
        "desc": "NSAIDs may interact with anticoagulants, blood pressure medications, and other drugs affecting kidney function.",
        "alt": "Use the lowest effective dose for the shortest duration. Consult your doctor.",
    },
    "statin": {
        "drugs": [
            "atorvastatin", "simvastatin", "rosuvastatin", "pravastatin",
            "fluvastatin", "lovastatin", "pitavastatin", "ezetimibe",
            "atorvastatin/ezetimibe", "rosuvastatin/ezetimibe",
        ],
        "level": "Moderate",
        "mechanism": "Statins can cause myopathy when combined with CYP3A4 inhibitors or other statins",
        "desc": "Combining statins with certain medications can increase the risk of muscle damage (myopathy).",
        "alt": "Monitor for muscle pain and consult your doctor about dose adjustments.",
    },
    "statin_intensive": {
        "drugs": [
            "atorvastatin 80mg", "rosuvastatin 40mg", "simvastatin 80mg",
        ],
        "level": "High Risk",
        "mechanism": "High-intensity statin therapy has higher risk of myopathy when combined with interacting drugs",
        "desc": "High-intensity statin therapy combined with interacting medications significantly increases myopathy risk.",
        "alt": "Consider switching to a lower-intensity statin or alternative therapy.",
    },
    "cyp3a4_inhibitor": {
        "drugs": [
            "ketoconazole", "itraconazole", "voriconazole", "posaconazole",
            "clarithromycin", "erythromycin", "telithromycin",
            "ritonavir", "lopinavir", "indinavir", "nelfinavir",
            "nefazodone", "fluconazole", "grapefruit", "cobicistat",
            "cyclosporine", "tacrolimus", "verapamil", "diltiazem",
            "amiodarone", "cimetidine", "fibric acid derivatives",
        ],
        "level": "Moderate",
        "mechanism": "CYP3A4 inhibitors can increase plasma concentrations of CYP3A4 substrates",
        "desc": "CYP3A4 inhibitors may increase the levels of other medications metabolized by CYP3A4.",
        "alt": "Dose adjustment may be needed. Consult your doctor or pharmacist.",
    },
    "cyp3a4_inducer": {
        "drugs": [
            "rifampin", "rifabutin", "rifapentine", "carbamazepine",
            "phenytoin", "phenobarbital", "primidone", "oxcarbazepine",
            "topiramate", "modafinil", "efavirenz", "nevirapine",
            "efavirenz", "etravirine", "rilpivirine",
            "hypericum perforatum", "st johns wort", "bosentan",
        ],
        "level": "Moderate",
        "mechanism": "CYP3A4 inducers can decrease plasma concentrations of CYP3A4 substrates",
        "desc": "CYP3A4 inducers may reduce the effectiveness of other medications metabolized by CYP3A4.",
        "alt": "Effectiveness of concomitant medications may be reduced. Consult your doctor.",
    },
    "ace_inhibitor": {
        "drugs": [
            "enalapril", "lisinopril", "ramipril", "perindopril",
            "quinapril", "benazepril", "fosinopril", "captopril",
            "moexipril", "trandolapril", "imidapril", "cilazapril",
            "spirapril", "temocapril", "zofenopril",
        ],
        "level": "Moderate",
        "mechanism": "ACE inhibitors can cause hyperkalemia with potassium-sparing agents and reduce renal function with NSAIDs",
        "desc": "ACE inhibitors may interact with potassium supplements, NSAIDs, and diuretics.",
        "alt": "Monitor potassium levels and kidney function. Consult your doctor.",
    },
    "arb": {
        "drugs": [
            "losartan", "valsartan", "candesartan", "irbesartan",
            "telmisartan", "olmesartan", "azilsartan", "eprosartan",
        ],
        "level": "Moderate",
        "mechanism": "ARBs can cause hyperkalemia with potassium-sparing agents and reduce renal function with NSAIDs",
        "desc": "ARBs may interact with potassium supplements, NSAIDs, and diuretics.",
        "alt": "Monitor potassium levels and kidney function. Consult your doctor.",
    },
    "diuretic": {
        "drugs": [
            "hydrochlorothiazide", "chlorthalidone", "indapamide",
            "furosemide", "bumetanide", "torsemide", "ethacrynic acid",
            "spironolactone", "eplerenone", "amiloride", "triamterene",
            "acetazolamide", "methazolamide", "bendroflumethiazide",
            "hydroflumethiazide", "trichlormethiazide", "cyclothiazide",
            "polythiazide", "meticrane", "xipamide", "clopamide",
            "fenquizone", "metolazone", "mefruside", "chlorthalidone",
        ],
        "level": "Moderate",
        "mechanism": "Diuretics can cause electrolyte imbalances when combined with other medications affecting electrolytes",
        "desc": "Diuretics may interact with medications affecting potassium, sodium, and magnesium levels.",
        "alt": "Monitor electrolyte levels. Consult your doctor.",
    },
    "potassium_sparing_diuretic": {
        "drugs": [
            "spironolactone", "eplerenone", "amiloride", "triamterene",
            "canrenone", "potassium canrenoate",
        ],
        "level": "High Risk",
        "mechanism": "Potassium-sparing diuretics can cause hyperkalemia when combined with ACE inhibitors, ARBs, or potassium supplements",
        "desc": "Combining potassium-sparing diuretics with ACE inhibitors, ARBs, or potassium supplements significantly increases the risk of high potassium levels.",
        "alt": "Avoid combining without medical supervision. Monitor potassium levels regularly.",
    },
    "ssri": {
        "drugs": [
            "fluoxetine", "sertraline", "paroxetine", "citalopram",
            "escitalopram", "fluvoxamine", "venlafaxine", "desvenlafaxine",
            "duloxetine", "milnacipran", "levomilnacipran", "vilazodone",
            "vortioxetine", "trazodone", "nefazodone", "mirtazapine",
            "bupropion", "tianeptine", "agomelatine",
        ],
        "level": "Moderate",
        "mechanism": "SSRIs and serotonergic agents can cause serotonin syndrome when combined with other serotonergic drugs or MAO inhibitors",
        "desc": "Combining SSRIs with other serotonergic medications can increase the risk of serotonin syndrome.",
        "alt": "Consult your doctor before combining serotonergic medications.",
    },
    "maoi": {
        "drugs": [
            "phenelzine", "tranylcypromine", "isocarboxazid", "selegiline",
            "rasagiline", "linezolid", "methylene blue", "procarbazine",
        ],
        "level": "High Risk",
        "mechanism": "MAO inhibitors can cause serotonin syndrome when combined with serotonergic agents and hypertensive crisis with tyramine-rich foods",
        "desc": "MAO inhibitors have serious interactions with many medications and require strict dietary restrictions.",
        "alt": "Avoid combining with serotonergic agents and follow dietary restrictions. Consult your doctor.",
    },
    "antidiabetic": {
        "drugs": [
            "metformin", "glibenclamide", "glipizide", "glimepiride",
            "gliclazide", "gliquidone", "tolbutamide", "chlorpropamide",
            "tolazamide", "acarbose", "miglitol", "voglibose",
            "sitagliptin", "saxagliptin", "linagliptin", "alogliptin",
            "vildagliptin", "gemigliptin",
            "pioglitazone", "rosiglitazone",
            "insulin", "insulin glargine", "insulin lispro", "insulin aspart",
            "insulin glulisine", "insulin detemir", "insulin degludec",
            "exenatide", "liraglutide", "semaglutide", "dulaglutide",
            "albiglutide", "lixisenatide", "tirzepatide",
            "empagliflozin", "dapagliflozin", "canagliflozin", "ertugliflozin",
            "remogliflozin", "sotagliflozin",
        ],
        "level": "Moderate",
        "mechanism": "Antidiabetic agents can cause hypoglycemia when combined and may require dose adjustments",
        "desc": "Combining antidiabetic medications may increase the risk of hypoglycemia or require dose adjustments.",
        "alt": "Monitor blood glucose levels closely. Consult your doctor for dose adjustments.",
    },
    "sulfonylurea": {
        "drugs": [
            "glibenclamide", "glipizide", "glimepiride", "gliclazide",
            "gliquidone", "tolbutamide", "chlorpropamide", "tolazamide",
        ],
        "level": "High Risk",
        "mechanism": "Sulfonylureas can cause prolonged hypoglycemia when combined with other antidiabetics or certain antibiotics",
        "desc": "Sulfonylureas combined with other antidiabetic medications significantly increase hypoglycemia risk.",
        "alt": "Dose reduction may be needed. Monitor blood glucose closely.",
    },
    "antibiotic": {
        "drugs": [
            "amoxicillin", "ampicillin", "flucloxacillin", "co-amoxiclav",
            "piperacillin", "ticarcillin", "azlocillin", "mezlocillin",
            "ticarcillin/clavulanate", "piperacillin/tazobactam",
            "cefuroxime", "cefadroxil", "cefalexin", "cefaclor",
            "cefprozil", "cefuroxime axetil", "cefdinir", "cefditoren",
            "cefpodoxime", "cefotaxime", "ceftazidime", "ceftriaxone",
            "cefepime", "ceftaroline", "ceftolozane/tazobactam",
            "ceftazidime/avibactam", "meropenem", "imipenem",
            "imipenem/cilastatin", "meropenem/vaborbactam",
            "ertapenem", "doripenem", "aztreonam",
            "ciprofloxacin", "levofloxacin", "moxifloxacin",
            "norfloxacin", "ofloxacin", "gemifloxacin",
            "gentamicin", "tobramycin", "amikacin", "streptomycin",
            "vancomycin", "teicoplanin", "daptomycin", "linezolid",
            "clindamycin", "metronidazole", "tinidazole", "ornidazole",
            "azithromycin", "clarithromycin", "erythromycin",
            "doxycycline", "minocycline", "tetracycline",
            "rifampicin", "rifabutin", "isoniazid", "pyrazinamide",
            "ethambutol", "streptomycin",
            "trimethoprim", "sulfamethoxazole", "co-trimoxazole",
            "nitrofurantoin", "fosfomycin", "colistin", "polymyxin b",
            "bacitracin", "neomycin", "nystatin", "amphotericin b",
            "fluconazole", "voriconazole", "caspofungin",
            "aciclovir", "valaciclovir", "famciclovir", "ganciclovir",
            "valganciclovir", "cidofovir", "foscarnet",
            "oseltamivir", "zanamivir", "peramivir", "baloxavir",
            "remdesivir", "molnupiravir", "nirmatrelvir/ritonavir",
        ],
        "level": "Moderate",
        "mechanism": "Antibiotics can interact with anticoagulants, antidiabetics, and other medications through various mechanisms",
        "desc": "Antibiotics may interact with other medications, affecting their levels or effectiveness.",
        "alt": "Monitor for signs of interaction. Consult your doctor or pharmacist.",
    },
    "macrolide": {
        "drugs": [
            "erythromycin", "clarithromycin", "azithromycin",
            "telithromycin", "roxithromycin", "dirithromycin",
        ],
        "level": "Moderate",
        "mechanism": "Macrolides are CYP3A4 inhibitors and can prolong QT interval when combined with other QT-prolonging agents",
        "desc": "Macrolides can interact with statins, anticoagulants, and other medications through CYP3A4 inhibition.",
        "alt": "Monitor for signs of toxicity. Consult your doctor.",
    },
    "fluoroquinolone": {
        "drugs": [
            "ciprofloxacin", "levofloxacin", "moxifloxacin",
            "norfloxacin", "ofloxacin", "gemifloxacin",
        ],
        "level": "Moderate",
        "mechanism": "Fluoroquinolones can chelate with cations and prolong QT interval",
        "desc": "Fluoroquinolones may interact with antacids, supplements, and other QT-prolonging medications.",
        "alt": "Separate administration from cations (calcium, iron, magnesium). Consult your doctor.",
    },
    "nsaid_selective": {
        "drugs": [
            "celecoxib", "etoricoxib", "parecoxib", "valdecoxib",
            "lumiracoxib", "firocoxib", "mavacoxib",
        ],
        "level": "Moderate",
        "mechanism": "COX-2 selective NSAIDs have cardiovascular risks when combined with other NSAIDs or anticoagulants",
        "desc": "COX-2 selective NSAIDs may increase cardiovascular risk when combined with anticoagulants.",
        "alt": "Use lowest effective dose. Monitor for cardiovascular symptoms.",
    },
    "benzodiazepine": {
        "drugs": [
            "diazepam", "lorazepam", "alprazolam", "clonazepam",
            "temazepam", "oxazepam", "nitrazepam", "midazolam",
            "triazolam", "flurazepam", "estazolam", "quazepam",
            "clobazam", "clotiazepam", "etoqualam", "fludiazepam",
            "haloxazolam", "ketazolam", "pinazepam", "prazepam",
        ],
        "level": "High Risk",
        "mechanism": "Benzodiazepines cause CNS depression which is enhanced by other CNS depressants, opioids, and alcohol",
        "desc": "Benzodiazepines combined with other CNS depressants, opioids, or alcohol significantly increase sedation and respiratory depression risk.",
        "alt": "Avoid combining with other CNS depressants or opioids. Consult your doctor.",
    },
    "opioid": {
        "drugs": [
            "morphine", "oxycodone", "hydrocodone", "codeine",
            "tramadol", "fentanyl", "hydromorphone", "oxymorphone",
            "methadone", "buprenorphine", "nalbuphine", "pentazocine",
            "tapentadol", "dihydrocodeine", "dihydroetorphine",
            "alfentanil", "sufentanil", "remifentanil", "lofentanil",
            "carfentanil", "etorphine", "levorphanol", "meperidine",
            "dextromoramide", "pethidine", "phenazocine",
        ],
        "level": "High Risk",
        "mechanism": "Opioids cause CNS and respiratory depression enhanced by other depressants, and serotonin syndrome with SSRIs",
        "desc": "Opioids combined with benzodiazepines, other CNS depressants, or serotonergic agents significantly increase risk of respiratory depression, sedation, or serotonin syndrome.",
        "alt": "Avoid combining with benzodiazepines or other opioids. Consult your doctor immediately.",
    },
    "antihistamine": {
        "drugs": [
            "cetirizine", "loratadine", "fexofenadine", "desloratadine",
            "levocetirizine", "bilastine", "rupatadine", "ebastine",
            "mizolastine", "acrivastine", "chlorphenamine", "diphenhydramine",
            "promethazine", "cyclizine", "cinnarizine", "hydroxyzine",
            "azelastine", "olopatadine", "ketotifen", "epinastine",
        ],
        "level": "Low",
        "mechanism": "First-generation antihistamines cause sedation enhanced by other CNS depressants",
        "desc": "First-generation antihistamines may cause increased sedation when combined with alcohol or other CNS depressants.",
        "alt": "Use second-generation antihistamines if sedation is a concern.",
    },
    "proton_pump_inhibitor": {
        "drugs": [
            "omeprazole", "esomeprazole", "lansoprazole", "pantoprazole",
            "rabeprazole", "dexlansoprazole",
        ],
        "level": "Moderate",
        "mechanism": "PPIs can reduce absorption of drugs requiring acidic pH and may interact with clopidogrel",
        "desc": "PPIs may reduce the effectiveness of clopidogrel and affect absorption of certain medications.",
        "alt": "Consider H2 blocker alternative if on clopidogrel. Consult your doctor.",
    },
    "calcium_channel_blocker": {
        "drugs": [
            "amlodipine", "nifedipine", "felodipine", "isradipine",
            "nicardipine", "nimodipine", "nisoldipine", "nitrendipine",
            "verapamil", "diltiazem", "bepridil", "prenylamine",
            "perhexiline", "fostedil", "mibefradil",
        ],
        "level": "Moderate",
        "mechanism": "Calcium channel blockers can cause bradycardia and hypotension when combined with beta-blockers or other CCBs",
        "desc": "Calcium channel blockers may interact with beta-blockers, other CCBs, and CYP3A4 inhibitors/inducers.",
        "alt": "Monitor heart rate and blood pressure. Consult your doctor.",
    },
    "beta_blocker": {
        "drugs": [
            "propranolol", "metoprolol", "atenolol", "bisoprolol",
            "nebivolol", "carvedilol", "labetalol", "nadolol",
            "pindolol", "timolol", "sotalol", "esmolol",
            "acebutolol", "betaxolol", "celiprolol", "levobunolol",
            "metipranolol", "penbutolol", "practolol",
        ],
        "level": "Moderate",
        "mechanism": "Beta-blockers can cause bradycardia and hypotension when combined with calcium channel blockers or other antihypertensives",
        "desc": "Beta-blockers may interact with calcium channel blockers, other antihypertensives, and antiarrhythmics.",
        "alt": "Monitor heart rate and blood pressure. Consult your doctor.",
    },
    "immunosuppressant": {
        "drugs": [
            "cyclosporine", "tacrolimus", "sirolimus", "everolimus",
            "mycophenolate", "mycophenolic acid", "azathioprine",
            "methotrexate", "cyclophosphamide", "mycophenolate mofetil",
        ],
        "level": "High Risk",
        "mechanism": "Immunosuppressants have narrow therapeutic indices and many CYP450 interactions",
        "desc": "Immunosuppressants require careful monitoring when combined with other medications due to narrow therapeutic windows.",
        "alt": "Regular blood level monitoring required. Consult your transplant team or doctor.",
    },
    "antiepileptic": {
        "drugs": [
            "phenytoin", "carbamazepine", "valproate", "lamotrigine",
            "levetiracetam", "topiramate", "gabapentin", "pregabalin",
            "oxcarbazepine", "zonisamide", "lacosamide", "perampanel",
            "eslicarbazepine", "retigabine", "rufinamide", "stiripentol",
            "brivaracetam", "cenobamate", "cannabidiol",
        ],
        "level": "Moderate",
        "mechanism": "Antiepileptics can induce or inhibit CYP enzymes affecting other drug levels",
        "desc": "Antiepileptic drugs may interact with oral contraceptives, anticoagulants, and other medications.",
        "alt": "Monitor for reduced effectiveness of concomitant medications. Consult your doctor.",
    },
    "anticoagulant_antiplatelet_combo": {
        "drugs": [],  # Special rule: checks if both classes present
        "level": "High Risk",
        "mechanism": "Combined anticoagulant + antiplatelet therapy has additive bleeding risk",
        "desc": "Combining anticoagulants with antiplatelet agents significantly increases bleeding risk.",
        "alt": "This combination should only be used under close medical supervision.",
    },
}


def get_drug_class(drug_name: str) -> Optional[str]:
    """
    Determine which drug class a drug belongs to.

    Returns the class name if found, None otherwise.
    """
    normalized = drug_name.strip().lower()

    for class_name, class_info in DRUG_CLASSES.items():
        if class_name == "anticoagulant_antiplatelet_combo":
            continue
        for drug in class_info.get("drugs", []):
            if normalized == drug.strip().lower():
                return class_name
            # Partial match for compound names
            if drug.strip().lower() in normalized or normalized in drug.strip().lower():
                return class_name

    return None


def check_class_interaction(drug1: str, drug2: str) -> Optional[dict]:
    """
    Check if two drugs interact based on their ATC classes.

    Returns interaction info if a class-level rule applies, None otherwise.
    """
    class1 = get_drug_class(drug1)
    class2 = get_drug_class(drug2)

    if not class1 or not class2:
        return None

    # Special rule: anticoagulant + antiplatelet
    anticoagulant_classes = {"anticoagulant", "antiplatelet"}
    if class1 in anticoagulant_classes and class2 in anticoagulant_classes:
        return {
            "level": "High Risk",
            "desc": "Combining anticoagulants with antiplatelet agents significantly increases bleeding risk.",
            "mechanism": "Anticoagulant + Antiplatelet combination",
            "alt": "This combination should only be used under close medical supervision.",
            "source": "class_rule",
        }

    # Check both directions for class rules
    rule_key = f"{class1}+{class2}"
    reverse_key = f"{class2}+{class1}"

    # Define class interaction rules
    class_rules = {
        "nsaid+anticoagulant": {
            "level": "Moderate",
            "desc": "NSAIDs can increase bleeding risk when taken with anticoagulants.",
            "mechanism": "NSAID + Anticoagulant",
            "alt": "Use acetaminophen for pain relief instead. Consult your doctor.",
        },
        "anticoagulant+nsaid": {
            "level": "Moderate",
            "desc": "NSAIDs can increase bleeding risk when taken with anticoagulants.",
            "mechanism": "Anticoagulant + NSAID",
            "alt": "Use acetaminophen for pain relief instead. Consult your doctor.",
        },
        "nsaid+ace_inhibitor": {
            "level": "Moderate",
            "desc": "NSAIDs may reduce the effectiveness of ACE inhibitors and increase kidney damage risk.",
            "mechanism": "NSAID + ACE Inhibitor",
            "alt": "Monitor kidney function. Consult your doctor.",
        },
        "ace_inhibitor+nsaid": {
            "level": "Moderate",
            "desc": "NSAIDs may reduce the effectiveness of ACE inhibitors and increase kidney damage risk.",
            "mechanism": "ACE Inhibitor + NSAID",
            "alt": "Monitor kidney function. Consult your doctor.",
        },
        "nsaid+arb": {
            "level": "Moderate",
            "desc": "NSAIDs may reduce the effectiveness of ARBs and increase kidney damage risk.",
            "mechanism": "NSAID + ARB",
            "alt": "Monitor kidney function. Consult your doctor.",
        },
        "arb+nsaid": {
            "level": "Moderate",
            "desc": "NSAIDs may reduce the effectiveness of ARBs and increase kidney damage risk.",
            "mechanism": "ARB + NSAID",
            "alt": "Monitor kidney function. Consult your doctor.",
        },
        "nsaid+diuretic": {
            "level": "Moderate",
            "desc": "NSAIDs may reduce the effectiveness of diuretics and increase kidney damage risk.",
            "mechanism": "NSAID + Diuretic",
            "alt": "Monitor kidney function and electrolytes. Consult your doctor.",
        },
        "diuretic+nsaid": {
            "level": "Moderate",
            "desc": "NSAIDs may reduce the effectiveness of diuretics and increase kidney damage risk.",
            "mechanism": "Diuretic + NSAID",
            "alt": "Monitor kidney function and electrolytes. Consult your doctor.",
        },
        "ace_inhibitor+potassium_sparing_diuretic": {
            "level": "High Risk",
            "desc": "ACE inhibitors combined with potassium-sparing diuretics can cause dangerously high potassium levels.",
            "mechanism": "ACE Inhibitor + Potassium-Sparing Diuretic",
            "alt": "Avoid this combination unless specifically prescribed. Monitor potassium levels.",
        },
        "potassium_sparing_diuretic+ace_inhibitor": {
            "level": "High Risk",
            "desc": "ACE inhibitors combined with potassium-sparing diuretics can cause dangerously high potassium levels.",
            "mechanism": "Potassium-Sparing Diuretic + ACE Inhibitor",
            "alt": "Avoid this combination unless specifically prescribed. Monitor potassium levels.",
        },
        "arb+potassium_sparing_diuretic": {
            "level": "High Risk",
            "desc": "ARBs combined with potassium-sparing diuretics can cause dangerously high potassium levels.",
            "mechanism": "ARB + Potassium-Sparing Diuretic",
            "alt": "Avoid this combination unless specifically prescribed. Monitor potassium levels.",
        },
        "potassium_sparing_diuretic+arb": {
            "level": "High Risk",
            "desc": "ARBs combined with potassium-sparing diuretics can cause dangerously high potassium levels.",
            "mechanism": "Potassium-Sparing Diuretic + ARB",
            "alt": "Avoid this combination unless specifically prescribed. Monitor potassium levels.",
        },
        "ssri+maoi": {
            "level": "High Risk",
            "desc": "Combining SSRIs with MAO inhibitors can cause serotonin syndrome, which can be life-threatening.",
            "mechanism": "SSRI + MAOI",
            "alt": "Never combine SSRIs with MAO inhibitors. Seek immediate medical attention if taken together.",
        },
        "maoi+ssri": {
            "level": "High Risk",
            "desc": "Combining MAO inhibitors with SSRIs can cause serotonin syndrome, which can be life-threatening.",
            "mechanism": "MAOI + SSRI",
            "alt": "Never combine MAO inhibitors with SSRIs. Seek immediate medical attention if taken together.",
        },
        "ssri+tramadol": {
            "level": "High Risk",
            "desc": "SSRIs combined with Tramadol can cause serotonin syndrome.",
            "mechanism": "SSRI + Serotonergic Opioid",
            "alt": "Use alternative pain management. Consult your doctor.",
        },
        "tramadol+ssri": {
            "level": "High Risk",
            "desc": "Tramadol combined with SSRIs can cause serotonin syndrome.",
            "mechanism": "Serotonergic Opioid + SSRI",
            "alt": "Use alternative pain management. Consult your doctor.",
        },
        "statin+cyp3a4_inhibitor": {
            "level": "High Risk",
            "desc": "CYP3A4 inhibitors can significantly increase statin levels, raising myopathy risk.",
            "mechanism": "Statin + CYP3A4 Inhibitor",
            "alt": "Consider switching to a statin not metabolized by CYP3A4 (e.g., rosuvastatin, pravastatin).",
        },
        "cyp3a4_inhibitor+statin": {
            "level": "High Risk",
            "desc": "CYP3A4 inhibitors can significantly increase statin levels, raising myopathy risk.",
            "mechanism": "CYP3A4 Inhibitor + Statin",
            "alt": "Consider switching to a statin not metabolized by CYP3A4 (e.g., rosuvastatin, pravastatin).",
        },
        "statin+cyp3a4_inducer": {
            "level": "Moderate",
            "desc": "CYP3A4 inducers can reduce statin effectiveness.",
            "mechanism": "Statin + CYP3A4 Inducer",
            "alt": "Monitor cholesterol levels. Dose adjustment may be needed.",
        },
        "cyp3a4_inducer+statin": {
            "level": "Moderate",
            "desc": "CYP3A4 inducers can reduce statin effectiveness.",
            "mechanism": "CYP3A4 Inducer + Statin",
            "alt": "Monitor cholesterol levels. Dose adjustment may be needed.",
        },
        "metformin+alcohol": {
            "level": "Moderate",
            "desc": "Alcohol can increase the risk of lactic acidosis when taken with Metformin.",
            "mechanism": "Metformin + Alcohol",
            "alt": "Avoid alcohol while on Metformin.",
        },
        "alcohol+metformin": {
            "level": "Moderate",
            "desc": "Alcohol can increase the risk of lactic acidosis when taken with Metformin.",
            "mechanism": "Alcohol + Metformin",
            "alt": "Avoid alcohol while on Metformin.",
        },
        "benzodiazepine+opioid": {
            "level": "High Risk",
            "desc": "Combining benzodiazepines with opioids significantly increases the risk of sedation and respiratory depression.",
            "mechanism": "Benzodiazepine + Opioid",
            "alt": "Avoid this combination. Seek alternative pain management strategies.",
        },
        "opioid+benzodiazepine": {
            "level": "High Risk",
            "desc": "Combining opioids with benzodiazepines significantly increases the risk of sedation and respiratory depression.",
            "mechanism": "Opioid + Benzodiazepine",
            "alt": "Avoid this combination. Seek alternative pain management strategies.",
        },
        "ssri+opioid": {
            "level": "Moderate",
            "desc": "SSRIs combined with tramadol or other serotonergic opioids can cause serotonin syndrome.",
            "mechanism": "SSRI + Serotonergic Opioid",
            "alt": "Monitor for serotonin syndrome symptoms. Consult your doctor.",
        },
        "opioid+ssri": {
            "level": "Moderate",
            "desc": "Serotonergic opioids combined with SSRIs can cause serotonin syndrome.",
            "mechanism": "Serotonergic Opioid + SSRI",
            "alt": "Monitor for serotonin syndrome symptoms. Consult your doctor.",
        },
        "antidiabetic+sulfonylurea": {
            "level": "High Risk",
            "desc": "Combining multiple antidiabetic agents significantly increases hypoglycemia risk.",
            "mechanism": "Antidiabetic Combination",
            "alt": "Dose reduction may be needed. Monitor blood glucose closely.",
        },
        "sulfonylurea+antidiabetic": {
            "level": "High Risk",
            "desc": "Combining sulfonylureas with other antidiabetic agents significantly increases hypoglycemia risk.",
            "mechanism": "Sulfonylurea + Antidiabetic",
            "alt": "Dose reduction may be needed. Monitor blood glucose closely.",
        },
        "anticoagulant+antiplatelet": {
            "level": "High Risk",
            "desc": "Combining anticoagulants with antiplatelet agents significantly increases bleeding risk.",
            "mechanism": "Anticoagulant + Antiplatelet",
            "alt": "This combination should only be used under close medical supervision.",
        },
        "antiplatelet+anticoagulant": {
            "level": "High Risk",
            "desc": "Combining antiplatelet agents with anticoagulants significantly increases bleeding risk.",
            "mechanism": "Antiplatelet + Anticoagulant",
            "alt": "This combination should only be used under close medical supervision.",
        },
    }

    rule = class_rules.get(rule_key) or class_rules.get(reverse_key)
    if rule:
        return {
            "level": rule["level"],
            "desc": rule["desc"],
            "mechanism": rule.get("mechanism", ""),
            "alt": rule.get("alt"),
            "source": "class_rule",
        }

    return None


def get_knowledge_based_interaction(drug1: str, drug2: str) -> Optional[dict]:
    """
    Get interaction info from knowledge-based rules.

    This combines ATC class rules with other heuristics.
    Returns None if no rule applies.
    """
    # First check class-level rules
    class_result = check_class_interaction(drug1, drug2)
    if class_result:
        return class_result

    # Additional heuristic rules
    # Same drug class interactions
    class1 = get_drug_class(drug1)
    class2 = get_drug_class(drug2)

    if class1 and class1 == class2:
        # Same class interaction
        if class1 in {"benzodiazepine", "opioid", "anticoagulant", "statin", "antidiabetic", "antiepileptic"}:
            return {
                "level": "Moderate",
                "desc": f"Combining two {class1} medications may increase the risk of side effects.",
                "mechanism": f"Same class: {class1}",
                "alt": "Consult your doctor or pharmacist.",
                "source": "class_rule",
            }

    return None
