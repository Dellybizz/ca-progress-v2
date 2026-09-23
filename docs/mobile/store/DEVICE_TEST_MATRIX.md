# Native device test matrix

Every checked result must record commit SHA, build number, device/OS, tester and timestamp. A repository test is not a device pass.

| Surface | Android internal track | iOS TestFlight | Required result |
| --- | --- | --- | --- |
| Install, cold start, resume | Current and oldest supported OS | Current and oldest supported iOS | No blank screen; hosted shell loads |
| Google/LinkedIn sign-in | Phone and tablet | iPhone and iPad | Same D1 account; callback returns to app |
| Dashboard, Today, Progress | Small phone and tablet | Small iPhone and iPad | Mobile composition, safe areas and rotation pass |
| Offline queue and recovery | Airplane mode/reconnect | Airplane mode/reconnect | Owner-isolated replay; conflicts remain explicit |
| Deep links | Verified App Link | Universal Link | Only allowlisted HTTPS routes open |
| R2 resources | PDF/image upload and reopen | PDF/image upload and reopen | Authorized private access only |
| Push/community | Foreground/background | Foreground/background | Permission is user initiated; correct account receives it |
| Account deletion | Request, cancel, due-process test account | Same | Seven-day window and processor receipt verified |
| Update gate | Build below recommended/minimum | Same | Notice/hard gate matches manifest |
| Billing | Native checkout disabled | Native checkout disabled | No Razorpay mutation from native shell |

Production promotion requires zero open critical/high defects and no privacy, identity, entitlement or data-loss regression.
