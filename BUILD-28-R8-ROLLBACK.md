# Build 28 R8 rollback record

Created before enabling R8 for version 28.

Pre-change release settings:

- `android.enableMinifyInReleaseBuilds=false`
- `android.enableShrinkResourcesInReleaseBuilds` was unset/false
- release used `proguard-android.txt`
- version code was 27
- version name was 1.2.4

Rollback: restore those values and set version code/name back to 27/1.2.4 only if the version-28 R8 build is rejected or fails runtime testing. The pre-change APK/AAB artifacts remain in the Android build output history only if they have not been overwritten; the source configuration above is the authoritative rollback reference.
