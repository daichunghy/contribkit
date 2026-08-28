use contribkit_rust_fixture::greeting;

#[test]
fn integration_test_uses_the_public_api() {
    assert_eq!(greeting(), "hello from cargo");
}
