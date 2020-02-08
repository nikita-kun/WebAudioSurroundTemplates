# WebAudioSurroundTemplates

### A simple browser class for playing customizable sound templates on multichannel equipment. 

Sound templates are written in JSON. Templates reference URLs of audio files and specify playback logic. State transitions and sound events are modeled using random processes from the embedded jstat/jstat library.
#### 
[Demo](https://nikita-kun.github.io/WebAudioSurroundTemplates/)

### Multichannel support (depending on a browser):
* Mono
* Stereo
* 4.0
* 5.1
* and other discrete sound configurations.

### State transitions
* *Time-scheduled state transitions* (e.g. go to state X at 21:00, go to state Y or Z every 30 minutes)
* *Random state transitions* (sampling of state duration from a distribution)

