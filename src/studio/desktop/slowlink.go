package main

import "desktop/internal/bridge"

// slowDawLink slows client's link when profile (the value of bridge.SlowLinkEnv) names a slowness, and says so in the host log, so a run
// slowed on purpose is never mistaken for a slow DAW. It is a development aid for reproducing a slow DAW (#3752): a command the app gave
// up on still reaches the DAW later, as it does on a slow machine, so it is for a project made for the test. A profile that does not
// parse slows nothing and is logged.
func slowDawLink(client *bridge.Client, profile string, report func(kind, message string) error) {
	if client == nil || profile == "" {
		return
	}
	link, err := bridge.ParseSlowLink(profile)
	if err != nil {
		_ = report("bridge.slow_link", bridge.SlowLinkEnv+" was not understood, so the DAW link is not slowed: "+err.Error())
		return
	}
	if !link.Slows() {
		return
	}
	client.SetSlowLink(link)
	_ = report("bridge.slow_link", "The DAW link is slowed on purpose by "+bridge.SlowLinkEnv+"="+profile+". Commands reach the DAW late, or not at all with drop=.")
}
