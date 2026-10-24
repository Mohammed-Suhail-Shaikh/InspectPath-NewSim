# Demo pool check (real model, test split)

8 of 10 planted patches matched; 9 of 10 close-ups matched; 12 of 12 clean patches matched.

Match = predicted tier equals the tier of the TRUE labels. Patches were not swapped.

| group | patch | true labels | predicted tier | detected | match |
|---|---|---|---|---|---|
| clean | clean_01 | background | none | - | yes |
| clean | clean_02 | background | none | - | yes |
| clean | clean_03 | background | none | - | yes |
| clean | clean_04 | background | none | - | yes |
| clean | clean_05 | background | none | - | yes |
| clean | clean_06 | background | none | - | yes |
| clean | clean_07 | background | none | - | yes |
| clean | clean_08 | background | none | - | yes |
| clean | clean_09 | background | none | - | yes |
| clean | clean_10 | background | none | - | yes |
| clean | clean_11 | background | none | - | yes |
| clean | clean_12 | background | none | - | yes |
| high | high_01 | exposed_bars | high | spallation, exposed_bars, efflorescence | yes |
| high_closeup | high_01_closeup | exposed_bars | high | spallation, exposed_bars | yes |
| high | high_02 | exposed_bars | high | spallation, exposed_bars | yes |
| high_closeup | high_02_closeup | exposed_bars | high | spallation, exposed_bars | yes |
| high | high_03 | spallation | high | spallation, corrosion_stain | yes |
| high_closeup | high_03_closeup | spallation | medium | crack, corrosion_stain | NO |
| high | high_04 | spallation | high | spallation | yes |
| high_closeup | high_04_closeup | spallation | high | crack, spallation, exposed_bars, corrosion_stain | yes |
| medium | medium_01 | corrosion_stain | medium | efflorescence, corrosion_stain | yes |
| medium_closeup | medium_01_closeup | corrosion_stain | medium | corrosion_stain | yes |
| medium | medium_02 | corrosion_stain | medium | efflorescence, corrosion_stain | yes |
| medium_closeup | medium_02_closeup | corrosion_stain | medium | corrosion_stain | yes |
| medium | medium_03 | corrosion_stain | medium | corrosion_stain | yes |
| medium_closeup | medium_03_closeup | corrosion_stain | medium | corrosion_stain | yes |
| low | low_01 | crack | high | spallation, efflorescence | NO |
| low_closeup | low_01_closeup | crack | low | crack | yes |
| low | low_02 | crack | low | crack | yes |
| low_closeup | low_02_closeup | crack | low | crack | yes |
| low | low_03 | efflorescence | medium | efflorescence, corrosion_stain | NO |
| low_closeup | low_03_closeup | efflorescence | low | efflorescence | yes |
