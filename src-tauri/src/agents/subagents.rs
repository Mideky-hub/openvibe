//! How many subagents each Claude session runs (spec orchestrateur §5.2), from
//! its `SubagentStart` / `SubagentStop` hooks.

use std::collections::HashMap;

#[derive(Default)]
pub struct SubagentCounts(HashMap<String, u32>);

impl SubagentCounts {
    /// The node's count after a start or a stop; never below zero.
    pub fn change(&mut self, node_id: &str, started: bool) -> u32 {
        let count = self.0.entry(node_id.to_string()).or_default();
        *count = if started {
            *count + 1
        } else {
            count.saturating_sub(1)
        };
        *count
    }

    /// The sessions that run some, for a page that (re)loads.
    pub fn running(&self) -> Vec<(String, u32)> {
        let mut running: Vec<(String, u32)> = self
            .0
            .iter()
            .filter(|(_, count)| **count > 0)
            .map(|(node_id, count)| (node_id.clone(), *count))
            .collect();
        running.sort();
        running
    }

    /// The session or its process ended: true when some were still counted.
    pub fn clear(&mut self, node_id: &str) -> bool {
        self.0.remove(node_id).is_some_and(|count| count > 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_the_subagents_a_session_runs_never_below_zero() {
        let mut counts = SubagentCounts::default();
        assert_eq!(counts.change("n1", true), 1);
        assert_eq!(counts.change("n1", true), 2);
        assert_eq!(counts.change("n1", false), 1);
        assert_eq!(counts.change("n1", false), 0);
        assert_eq!(counts.change("n1", false), 0);
        assert_eq!(counts.change("n2", true), 1);
        assert_eq!(counts.running(), vec![("n2".to_string(), 1)]);
        assert!(counts.clear("n2"));
        assert!(counts.running().is_empty());
        assert!(!counts.clear("n2"));
    }
}
