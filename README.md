# ccd-instruments

Three offline, single-file instruments that turn the Countervailing Co-Deployment framework into something a stranger can score, dispute, and recompute.

They are the sibling of [claimant-tools](https://github.com/panitzvanessa/claimant-tools), built on the same rule. Each one is a single HTML file that runs in a browser with no installation, makes no network request, and stores nothing unless the person using it exports it.

The framework holds that a technology which foreseeably speeds up one side of an unequal legal relationship is legitimately deployed only when a proportionate countervailing capability is deployed alongside it for the other side. These three instruments answer the two questions that claim raises. How much is owed, and has it been paid.

## The instruments

**Due Process Calibrator** fixes the co-deployment level a described system triggers. You describe an automated system in a free-text field and then position eleven inputs, each rated one to five.

Four inputs classify the stakes in the register of Mathews v. Eldridge, the severity and reversibility of the harm, the vulnerability of the affected population, the risk of erroneous deprivation together with the probable value of added safeguards, and the deployer's burden entered as a counterweight. Six profile the bare system's asymmetry, its opacity of reasons, the contestability of the specific output, human recourse, proprietary secrecy, validation on the affected population, and decisiveness. A final input, from zero to two, records whether the decision embeds a contested value trade-off, with a free line naming the values in tension.

If you do not think in sliders, a guided assessment of twelve plain-language questions is synchronized with them in both directions, and six worked system profiles are available as starting points.

The arithmetic is disclosed in full inside the page. A base score averages the first three stakes inputs. The deployer's burden then offsets it at forty percent of its distance from the midpoint, the asymmetry profile adjusts the result at forty percent of its average's distance from the midpoint, and the value trade-off setting adds a quarter point per level. The result is clamped to the one-to-five scale and read in bands, below 2.3 a minimal duty, below 3.4 moderate, otherwise high. The maximal band is deliberately hard to reach, requiring 4.3 or above together with severe harm, a vulnerable population, near-absent human recourse, and high opacity or proprietary shielding, so the strongest label stays reserved for the trigger profile the framework describes.

What comes out is more than a number. The calibrator returns the duty intensity, the required co-deployment level from 0 to 3, a written analysis narrating every input's contribution, and a countervailing package listing the safeguards that level demands, with their sources. Case anchors are verified, among them Goldberg, Perdue, Houston, Bauserman, K.W. v. Armstrong, and Loomis.

The weights are study choices with no legal authority. Their function is to make a duty discussable and disagreements locatable. An evaluator who disputes a verdict can point to the exact input she would score differently. Open `due-process-calibrator.html`.

**Claimant-Side Tool Evaluator** measures whether an existing counterpart delivers what the calibrator fixed. The question is never whether a tool is good in the abstract, only whether it is sufficient for the obligation the automated system generates. A polished tool can still fail a Level 3 duty, and a modest one can satisfy a Level 1 duty completely.

It scores thirteen capabilities. Five are the claimant functions the framework names, translation, eligibility explanation, evidence mapping, error and mismatch detection, and contestation support. The remaining eight look at the tool itself, its explainability, accessibility, human escalation, data sovereignty, continuous maintenance, resistance to category mimicry, practical effectiveness, and the cost of contestation it imposes.

An evidence discipline governs the scoring and it is the part that matters. A capability verified in use may earn the full scale. A capability documented but unobserved is capped at the midpoint. A capability asserted without evidence counts as zero and is reported by name as unverified. Paper claims are ceilings, not measurements. The thirteen effective scores average into a delivered percentage, the required level maps to an anchor rising with the duty, and the shortfall against that anchor is the due process gap. Open `claimant-tool-evaluator.html`.

**KDMA Elicitor** structures the judgment the calibrator's last input asks for. Some automated decisions embed a genuine trade-off, administrative efficiency and program integrity weighed against timely access to subsistence, the kind of balance reasonable officials could strike differently on identical facts. The elicitor makes that balance explicit and records where the person scoring it stands, so the judgment enters the calibration as a stated position rather than a silent one. It can hand its result to the calibrator through a link fragment. Open `kdma-elicitor.html`.

## Tests

Each instrument ships with a test suite whose expected values were computed by hand before the software was consulted. Open a tool in a browser, open the developer console, and load the matching file.

`test-due-process-calibrator.js` covers the calibrator, `test-claimant-tool-evaluator.js` the evaluator, and `test-kdma-elicitor.js` the elicitor.

## How to use them

Download a file and open it in any browser, online or offline. Everything runs on the page. To keep your work, use the tool's own export, which writes to your device only.

These are meant to be argued with. If you rescore a system and reach a different band, that disagreement is the point, and it will land on a named input rather than on an intuition.

## Privacy

No network calls, no analytics, no identifiers requested. You can confirm this by reading the source, since each instrument is a single readable HTML file.

## Status

Built as part of research on the claimant's side of automated benefits administration. The framework they implement is proposed as a testable proposition rather than settled doctrine, and the instruments are offered for the adversarial use their disclosure invites.

MIT licensed.
