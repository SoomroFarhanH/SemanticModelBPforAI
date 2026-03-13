# SemanticModelBPforAI

A scored Scorecard (0–100) with a rating (AI Ready / Mostly Ready / Needs Improvement / Not Ready) and a prioritised action list (Critical → Important → Recommended).

How to use

Upload to a Microsoft Fabric workspace notebook

Set dataset and workspace parameters in cell 5

Run all cells

Limitation:

It can not able to access Prep Data AI setup 

It is checking the best practices documented at https://learn.microsoft.com/en-us/fabric/data-science/semantic-model-best-practices#prep-for-ai-make-semantic-model-ai-ready

11 Checks + 1 Bonus

#	Check	Max Score

1	Star Schema — M:M relationships, bidirectional cross-filter, isolated tables	15

2	Business-friendly naming — detects DIM_, FACT_, _AMT, all-caps, abbreviations	10

3	Object descriptions — coverage % across tables, columns, measures	15

4	Synonyms — inspects TOM for synonyms on tables/columns/measures	5

5	Implicit measures — numeric columns with Summarize By ≠ None	10

6	Duplicate/overlapping measures — semantic groups + near-identical names	5

7	Ambiguous date fields — multiple date columns without guidance	5

8	Hidden objects risk — hidden columns that break Verified Answers	5

9	Model complexity/bloat — visible helper measures, column/measure counts	5

10	Prep for AI — annotation scan for AI Schema, Instructions, Verified Answers + full manual checklist	15

11	Best Practice Analyzer — runs the full 60+ rule BPA	10

+	Bonus: Measure Dependencies — shows what each measure depends on for AI Schema config	—
  
