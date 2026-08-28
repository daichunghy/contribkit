pub fn greeting() -> &'static str {
    "hello from cargo"
}

#[cfg(test)]
mod tests {
    use super::greeting;

    #[test]
    fn returns_a_stable_greeting() {
        assert_eq!(greeting(), "hello from cargo");
    }
}
