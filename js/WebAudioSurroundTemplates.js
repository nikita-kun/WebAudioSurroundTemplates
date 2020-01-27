Array.prototype.random = function() {
    return this[Math.floor(Math.random() * this.length)];
}

class WebAudioTemplatePlayer {
    constructor(debug = false, channelCount = undefined) {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.context = new AudioContext({
                latencyHint: "playback"
            });

            this.debug = debug;
            this.gain = 1.0;
            if (this.context.destination.maxChannelCount > 0) {
                this.channelCount = channelCount ? channelCount : this.context.destination.maxChannelCount;
                this.context.destination.channelCount = this.channelCount;
            } else {
                this.channelCount = this.context.destination.channelCount;
            }
            console.log("WebAudioTemplatePlayer Initializing. Channels: " + this.channelCount + ". Sample rate: " + this.context.sampleRate);
            this.merger = this.context.createChannelMerger(this.channelCount);
            this.merger.connect(this.context.destination);
            this.buffers = {};
            this.pause = false;
            this.reloadTime = 100000000000;

        } catch (err) {
            console.error("WebAudioTemplatePlayer failed to Initialize", err);
        }

    }

    reloadContext() {
        if (this.debug)
            console.log("Trying to restart the context");
        try {
            this.context.suspend();
            this.context.resume();
        } catch (err) {

        }
        setTimeout(() => {
            this.reloadContext()
        }, this.reloadTime * 1000);
    }

    loadTemplate(url, runDefault = true, overrideParameters = {}) {
        var player = this;
        this.runDefault = runDefault;
        fetch(url).then(this.resolveResponseJSON).then((template) => {
            player.template = template;

            for (var key in overrideParameters) {
                if (overrideParameters.hasOwnProperty(key)) {
                    template[key] = overrideParameters[key];
                }
            }

            player.loadSources();

            if (template.reloadTime) {
                player.reloadTime = template.reloadTime;
                player.reloadContext();
            }
            if (template.gain)
                player.gain = template.gain;
            if (template.debug)
                player.debug = true;
            if (player.runDefault && template.defaultState)
                player.gotoState(template.defaultState);

            console.log("Loading the template", url, template);
            player = null;
        });
    }

    resolveResponseJSON(response) {
        return response.json();
    }

    resolveResponseArrayBuffer(response) {
        return response.arrayBuffer();
    }

    loadSources() {
        Object.keys(this.template.sources).forEach(this.loadSource, this);
    }

    loadSource(source) {
        this.loadSamples(source);
    }

    triggerSource(sourceName) {
        var source = this.template.sources[sourceName];
        source.pause = false;
        if (source.scheduled) {
            return;
        }
        source.scheduled = true;
        var delay = jStat[source.delay.x].sample(...source.delay.params) * 1000;
        setTimeout(() => {
            this.emitSource(sourceName, true);
            source = null;
            delay = null;
        }, delay);
    }


    stopSource(sourceName) {
        return this.template.sources[sourceName].pause = true;
    }

    stopSources() {
        Object.keys(this.template.sources).forEach(this.stopSource, this);
    }

    getRandomChannelForSource(source) {
        return Array.isArray(source.channels) ? source.channels.random() : Math.floor(jStat.uniform.sample(0, this.channelCount));
    }

    emitSource(sourceName, trigger = false) {
        var source = this.template.sources[sourceName];
        var sample = source.samples.random();

        var bufferSource = this.context.createBufferSource();
        var gainNode = this.context.createGain();
        try {
            gainNode.channelCount = this.buffers[sample].numberOfChannels;
            gainNode.channelCountMode = 'explicit';
            gainNode.gain.value = this.gain * jStat[source.volume.x].sample(...source.volume.params);
            bufferSource.buffer = this.buffers[sample];
            bufferSource.connect(gainNode);

            var splitter = this.context.createChannelSplitter(gainNode.channelCount);
            gainNode.connect(splitter);


            if (source.multichannel) {
                if (source.channels) {
                    for (var playerChannel = 0, sampleChannel = 0; playerChannel < this.channelCount; playerChannel++) {
                        if (!source.channels.includes(playerChannel))
                            continue;
                        splitter.connect(this.merger, sampleChannel, playerChannel);
                        if (++sampleChannel >= bufferSource.buffer.numberOfChannels)
                            sampleChannel = 0;
                    }
                } else {
                    for (var playerChannel = 0, sampleChannel = 0; playerChannel < this.channelCount; playerChannel++) {
                        splitter.connect(this.merger, sampleChannel, playerChannel);
                        if (++sampleChannel >= bufferSource.buffer.numberOfChannels)
                            sampleChannel = 0;
                    }
                }
            } else {
                for (var sampleChannel = 0; sampleChannel < bufferSource.buffer.numberOfChannels; sampleChannel++) {
                    splitter.connect(this.merger, sampleChannel, this.getRandomChannelForSource(source));
                }
            }

            bufferSource.start();
            setTimeout(() => {
                gainNode = null;
                bufferSource = null;
                source = null;
                sample = null;
            }, 2 * bufferSource.buffer.duration);
        } catch (err) {
            if (this.debug)
                console.log("Failed to emit source: " + sourceName, err);
        }

        source.scheduled = false;
        if (this.debug)
            console.log(sourceName, sample, "volume=" + gainNode.gain.value);

        if (!source.pause && trigger)
            this.triggerSource(sourceName);
    }


    gotoState(stateName) {
        this.pause = false;
        this.state = stateName;
        var state = this.template.states[stateName];
        var duration = jStat[state.duration.x].sample(...state.duration.params) * 1000;
        if (this.debug)
            console.log("state: " + stateName + " (" + duration + " ms)");
        state.sources.forEach(this.triggerSource, this);
        setTimeout(() => {
            this.stopSources();
            if (!this.pause)
                this.gotoState(state.nextStates.random());
            else {
                console.log("state: none");
            }
        }, duration);
    }

    loopState(stateName) {
        this.pause = false;
        this.state = stateName;
        var state = this.template.states[stateName];
        if (this.debug)
            console.log("state: " + stateName + " (loop)");
        state.sources.forEach(this.triggerSource, this);
    }

    resetState() {
        this.pause = true;
        this.gain = 1.0;
        Object.keys(this.template.sources).forEach(this.stopSource, this);
    }

    loadSamples(source) {
        if (Array.isArray(this.template.sources[source].samples))
            this.template.sources[source].samples.forEach(this.loadSample, this);
    }

    loadSample(sampleUrl) {
        var player = this;
        player.buffers[sampleUrl] = fetch(sampleUrl).then(
            this.resolveResponseArrayBuffer,
            () => {
                throw ("Failed to open a sample: " + sampleUrl)
            }
        ).then(
            (sampleData) => {
                try {
                    player.context.decodeAudioData(sampleData).then(
                        (buffer) => {
                            player.buffers[sampleUrl] = buffer;
                            player = null;
                        },
                        () => {
                            throw ("Failed to interpret a sample: " + sampleUrl)
                        }
                    )
                } catch (err) {
                    /* Safari fix */
                    player.context.decodeAudioData(sampleData, (buffer) => {
                        player.buffers[sampleUrl] = buffer;
                        player = null;
                    });

                }
            }
        );
        this.context.resume();
    }
}