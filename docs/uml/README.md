# Piano Sheets — UML diagrams

System design diagrams for the current app, drawn from the shipped code in
`index.html` and the two test files. The app is a single self-contained HTML
file: no backend, no database, and no network calls at runtime.

| Diagram | What it shows |
| --- | --- |
| [Class diagram](class-diagram.png) | The data model — tune, variant, note line, token and sequence note — plus the tech stack |
| [Component & deployment diagram](component-deployment-diagram.png) | Which components run where, and how the file is published and delivered |
| [Activity diagrams](activity-diagrams.png) | The product flows: learning a tune, and adding a new tune |
| [Sequence diagram](sequence-diagram.png) | The calls behind Play and Follow along, in time order |

The two instrument variants are the Gigglescape (15 white keys, the `gig`
variant in the code) and the Casio CT-X700 (17 white keys, the `casio`
variant).
